package resource

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"strings"

	"github.com/mattn/go-sqlite3"

	"mycount/core/auth"
	"mycount/core/httpx"
	"mycount/storage"
)

// Kind décrit comment lire une colonne depuis le JSON reçu.
type Kind int

const (
	Text        Kind = iota // chaîne, jamais null
	NullText                // chaîne ou null
	NullReal                // nombre ou null
	Integer                 // entier, jamais null
	NullInteger             // entier ou null
)

const (
	errInvalidBody    = "errors.invalidBody"
	errInvalidID      = "errors.invalidId"
	errUnknownField   = "errors.unknownField"
	errMissingField   = "errors.missingField"
	errNotFound       = "errors.notFound"
	errConstraint     = "errors.constraint"
	errUniqueConflict = "errors.uniqueViolation"
	errDatabase       = "errors.database"
)

var nullLiteral = []byte("null")

// Spec décrit une table exposée en CRUD, restreinte aux lignes de l'utilisateur.
//
// Deux cas de propriété :
//   - table racine : elle porte id_utilisateur, renseigné par le serveur à la création ;
//   - table enfant : la propriété se lit sur le parent, désigné par ParentColumn et
//     vérifié par ParentOwned à la création comme à chaque modification.
type Spec struct {
	Table    string
	IDColumn string
	Columns  map[string]Kind // colonnes que le client peut écrire
	Required []string        // colonnes obligatoires à la création
	Returned string          // colonnes renvoyées, dans l'ordre

	Rooted bool

	ParentColumn string
	// ParentOwned : sous-requête SELECT sur la table parente, deux « ? » : id du parent puis utilisateur.
	ParentOwned string
	// OwnedIDs : sous-requête qui liste les valeurs de ParentColumn possédées, un « ? » : l'utilisateur.
	OwnedIDs string

	// Ordered : la colonne ordre numérote les lignes 0..n-1 dans leur liste (utilisateur ou
	// parent). Seul le serveur l'écrit : fin de liste à la création, trou refermé à la
	// suppression, décalages dans Move.
	Ordered bool
	// Archived : Delete n'efface pas, il date archive_le. La ligne reste lue (le front la masque)
	// et tout ce qui en dépend (journal) est conservé.
	Archived bool
}

// ownerClause restreint une instruction aux lignes de l'utilisateur (un seul « ? »).
func (s Spec) ownerClause() string {
	if s.Rooted {
		return "id_utilisateur = ?"
	}
	return s.ParentColumn + " IN (" + s.OwnedIDs + ")"
}

// listColumn désigne la colonne qui délimite une liste ordonnée.
func (s Spec) listColumn() string {
	if s.Rooted {
		return "id_utilisateur"
	}
	return s.ParentColumn
}

// countOrdre compte les lignes d'une liste : ordre d'une ligne ajoutée à la fin (un « ? »).
func (s Spec) countOrdre() string {
	return "(SELECT COUNT(*) FROM " + s.Table + " WHERE " + s.listColumn() + " = ?)"
}

// Create insère une ligne et la renvoie telle qu'enregistrée.
func (s Spec) Create(w http.ResponseWriter, r *http.Request) {
	fields, ok := decodeFields(w, r)
	if !ok {
		return
	}

	userID := auth.UserID(r)
	allowed := s.Columns
	if !s.Rooted {
		allowed = withColumn(s.Columns, s.ParentColumn, Integer)
	}

	columns, values, ok := readColumns(w, fields, allowed)
	if !ok {
		return
	}
	for _, required := range s.Required {
		if !slices.Contains(columns, required) {
			httpx.WriteError(w, http.StatusBadRequest, errMissingField)
			return
		}
	}

	placeholders := strings.Repeat("?, ", len(columns))
	var query string
	var args []any

	// ordre calculé dans la même instruction : deux créations simultanées ne peuvent pas
	// recevoir la même place.
	ordreColumn, ordreValue := "", ""
	if s.Ordered {
		ordreColumn, ordreValue = ", ordre", ", "+s.countOrdre()
	}

	if s.Rooted {
		// Colonnes utilisateur puis id_utilisateur, qui ne vient jamais du client.
		query = "INSERT INTO " + s.Table + " (" + strings.Join(columns, ", ") + ", id_utilisateur" + ordreColumn + ")" +
			" VALUES (" + placeholders + "?" + ordreValue + ")" +
			" RETURNING " + s.Returned
		args = append(values, userID)
		if s.Ordered {
			args = append(args, userID)
		}
	} else {
		// INSERT … SELECT … WHERE EXISTS : la ligne n'est créée que si le parent appartient
		// à l'utilisateur, en une seule instruction et sans fenêtre de concurrence.
		parentIndex := slices.Index(columns, s.ParentColumn)
		query = "INSERT INTO " + s.Table + " (" + strings.Join(columns, ", ") + ordreColumn + ")" +
			" SELECT " + strings.TrimSuffix(placeholders, ", ") + ordreValue +
			" WHERE EXISTS (" + s.ParentOwned + ")" +
			" RETURNING " + s.Returned
		args = values
		if s.Ordered {
			args = append(args, values[parentIndex])
		}
		args = append(args, values[parentIndex], userID)
	}

	row, err := queryOne(r.Context(), query, args...)
	if err != nil {
		writeDBError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, row)
}

// Patch met à jour les seules colonnes présentes dans le corps.
func (s Spec) Patch(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.PathInt(r, "id")
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, errInvalidID)
		return
	}

	fields, ok := decodeFields(w, r)
	if !ok {
		return
	}
	columns, values, ok := readColumns(w, fields, s.Columns)
	if !ok {
		return
	}
	if len(columns) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, errMissingField)
		return
	}

	query := "UPDATE " + s.Table + " SET " + strings.Join(columns, " = ?, ") + " = ?" +
		" WHERE " + s.IDColumn + " = ? AND " + s.ownerClause() +
		" RETURNING " + s.Returned

	row, err := queryOne(r.Context(), query, append(values, id, auth.UserID(r))...)
	if err != nil {
		writeDBError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, row)
}

// Delete supprime une ligne ; les ON DELETE du schéma propagent aux tables liées.
func (s Spec) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.PathInt(r, "id")
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, errInvalidID)
		return
	}
	if s.Archived {
		s.archive(w, r, id)
		return
	}
	if s.Ordered {
		s.deleteOrdered(w, r, id)
		return
	}

	stmt, err := storage.Stmt("DELETE FROM " + s.Table + " WHERE " + s.IDColumn + " = ? AND " + s.ownerClause())
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, errDatabase)
		return
	}

	result, err := stmt.ExecContext(r.Context(), id, auth.UserID(r))
	if err != nil {
		writeDBError(w, err)
		return
	}
	if affected, err := result.RowsAffected(); err != nil || affected == 0 {
		httpx.WriteError(w, http.StatusNotFound, errNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// archive date archive_le ; idempotent, renvoie la ligne.
func (s Spec) archive(w http.ResponseWriter, r *http.Request, id int64) {
	query := "UPDATE " + s.Table + " SET archive_le = date('now') WHERE " + s.IDColumn + " = ? AND " + s.ownerClause() +
		" RETURNING " + s.Returned
	row, err := queryOne(r.Context(), query, id, auth.UserID(r))
	if err != nil {
		writeDBError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, row)
}

// deleteOrdered supprime une ligne et referme le trou dans sa liste, en une transaction.
func (s Spec) deleteOrdered(w http.ResponseWriter, r *http.Request, id int64) {
	ctx := r.Context()

	tx, err := storage.DB().BeginTx(ctx, nil)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, errDatabase)
		return
	}
	defer func() { _ = tx.Rollback() }()

	var list, ordre int64
	query := "SELECT " + s.listColumn() + ", ordre FROM " + s.Table + " WHERE " + s.IDColumn + " = ? AND " + s.ownerClause()
	if err := txQueryRow(ctx, tx, query, id, auth.UserID(r)).Scan(&list, &ordre); err != nil {
		writeDBError(w, err)
		return
	}

	steps := []struct {
		query string
		args  []any
	}{
		{"DELETE FROM " + s.Table + " WHERE " + s.IDColumn + " = ?", []any{id}},
		{"UPDATE " + s.Table + " SET ordre = ordre - 1 WHERE " + s.listColumn() + " = ? AND ordre > ?", []any{list, ordre}},
	}
	for _, step := range steps {
		if err := txExec(ctx, tx, step.query, step.args...); err != nil {
			writeDBError(w, err)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		writeDBError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Move place une ligne à la position ordre de sa liste. Pour une table enfant, le corps
// désigne aussi le parent cible, qui peut être l'actuel : { "<ParentColumn>": …, "ordre": … }.
//
// Tout se fait dans une transaction : lecture de la place actuelle, trou refermé dans
// l'ancienne liste, place ouverte dans la nouvelle, puis écriture de la ligne.
func (s Spec) Move(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.PathInt(r, "id")
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, errInvalidID)
		return
	}

	fields, ok := decodeFields(w, r)
	if !ok {
		return
	}
	allowed := map[string]Kind{"ordre": Integer}
	if !s.Rooted {
		allowed = withColumn(allowed, s.ParentColumn, Integer)
	}
	columns, values, ok := readColumns(w, fields, allowed)
	if !ok {
		return
	}
	if len(columns) != len(allowed) {
		httpx.WriteError(w, http.StatusBadRequest, errMissingField)
		return
	}

	ctx := r.Context()
	userID := auth.UserID(r)
	ordre := values[slices.Index(columns, "ordre")].(int64)
	target := userID
	if !s.Rooted {
		target = values[slices.Index(columns, s.ParentColumn)].(int64)
	}

	tx, err := storage.DB().BeginTx(ctx, nil)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, errDatabase)
		return
	}
	defer func() { _ = tx.Rollback() }()

	var source, current int64
	query := "SELECT " + s.listColumn() + ", ordre FROM " + s.Table + " WHERE " + s.IDColumn + " = ? AND " + s.ownerClause()
	if err := txQueryRow(ctx, tx, query, id, userID).Scan(&source, &current); err != nil {
		writeDBError(w, err)
		return
	}

	if !s.Rooted {
		var found int
		if err := txQueryRow(ctx, tx, s.ParentOwned, target, userID).Scan(&found); err != nil {
			writeDBError(w, err)
			return
		}
	}

	// Places valides : 0 à n, n comptant les lignes de la liste cible hors la ligne déplacée.
	var count int64
	query = "SELECT COUNT(*) FROM " + s.Table + " WHERE " + s.listColumn() + " = ? AND " + s.IDColumn + " != ?"
	if err := txQueryRow(ctx, tx, query, target, id).Scan(&count); err != nil {
		writeDBError(w, err)
		return
	}
	if ordre < 0 || ordre > count {
		httpx.WriteError(w, http.StatusBadRequest, errInvalidBody)
		return
	}

	// Les trois étapes restent justes quand la liste cible est la liste d'origine.
	steps := []struct {
		query string
		args  []any
	}{
		{"UPDATE " + s.Table + " SET ordre = ordre - 1 WHERE " + s.listColumn() + " = ? AND ordre > ? AND " + s.IDColumn + " != ?", []any{source, current, id}},
		{"UPDATE " + s.Table + " SET ordre = ordre + 1 WHERE " + s.listColumn() + " = ? AND ordre >= ? AND " + s.IDColumn + " != ?", []any{target, ordre, id}},
		{"UPDATE " + s.Table + " SET " + s.listColumn() + " = ?, ordre = ? WHERE " + s.IDColumn + " = ?", []any{target, ordre, id}},
	}
	for _, step := range steps {
		if err := txExec(ctx, tx, step.query, step.args...); err != nil {
			writeDBError(w, err)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		writeDBError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// txQueryRow exécute une requête préparée dans la transaction. Si la préparation échoue,
// la requête part non préparée : l'erreur éventuelle ressort au Scan.
func txQueryRow(ctx context.Context, tx *sql.Tx, query string, args ...any) *sql.Row {
	stmt, err := storage.Stmt(query)
	if err != nil {
		return tx.QueryRowContext(ctx, query, args...)
	}
	return tx.StmtContext(ctx, stmt).QueryRowContext(ctx, args...)
}

// TxQueryRow et TxExec exposent les helpers de transaction aux handlers dédiés.
func TxQueryRow(ctx context.Context, tx *sql.Tx, query string, args ...any) *sql.Row {
	return txQueryRow(ctx, tx, query, args...)
}

func TxExec(ctx context.Context, tx *sql.Tx, query string, args ...any) error {
	return txExec(ctx, tx, query, args...)
}

// txExec exécute une instruction préparée dans la transaction.
func txExec(ctx context.Context, tx *sql.Tx, query string, args ...any) error {
	stmt, err := storage.Stmt(query)
	if err != nil {
		return err
	}
	_, err = tx.StmtContext(ctx, stmt).ExecContext(ctx, args...)
	return err
}

// List renvoie toutes les lignes de l'utilisateur, triées par orderBy.
func (s Spec) List(ctx context.Context, userID int64, orderBy string) ([]map[string]any, error) {
	query := "SELECT " + s.Returned + " FROM " + s.Table + " WHERE " + s.ownerClause() + " ORDER BY " + orderBy
	return QueryAll(ctx, query, userID)
}

// QueryAll exécute une requête préparée et renvoie chaque ligne sous forme de map colonne → valeur.
func QueryAll(ctx context.Context, query string, args ...any) ([]map[string]any, error) {
	stmt, err := storage.Stmt(query)
	if err != nil {
		return nil, err
	}

	rows, err := stmt.QueryContext(ctx, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	result := make([]map[string]any, 0)
	for rows.Next() {
		row, err := scanRow(rows, columns)
		if err != nil {
			return nil, err
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

// QueryOne renvoie la première ligne, ou sql.ErrNoRows.
func QueryOne(ctx context.Context, query string, args ...any) (map[string]any, error) {
	return queryOne(ctx, query, args...)
}

func queryOne(ctx context.Context, query string, args ...any) (map[string]any, error) {
	rows, err := QueryAll(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, sql.ErrNoRows
	}
	return rows[0], nil
}

func scanRow(rows *sql.Rows, columns []string) (map[string]any, error) {
	values := make([]any, len(columns))
	pointers := make([]any, len(columns))
	for i := range values {
		pointers[i] = &values[i]
	}
	if err := rows.Scan(pointers...); err != nil {
		return nil, err
	}

	row := make(map[string]any, len(columns))
	for i, column := range columns {
		if bytesValue, isBytes := values[i].([]byte); isBytes {
			row[column] = string(bytesValue)
			continue
		}
		row[column] = values[i]
	}
	return row, nil
}

func decodeFields(w http.ResponseWriter, r *http.Request) (map[string]json.RawMessage, bool) {
	var fields map[string]json.RawMessage
	if err := httpx.DecodeJSON(w, r, &fields); err != nil || fields == nil {
		httpx.WriteError(w, http.StatusBadRequest, errInvalidBody)
		return nil, false
	}
	return fields, true
}

// readColumns valide chaque champ contre la liste autorisée. Les colonnes sortent triées :
// un même jeu de champs produit toujours le même SQL, donc la même requête préparée.
func readColumns(w http.ResponseWriter, fields map[string]json.RawMessage, allowed map[string]Kind) ([]string, []any, bool) {
	columns := make([]string, 0, len(fields))
	for name := range fields {
		if _, ok := allowed[name]; !ok {
			httpx.WriteError(w, http.StatusBadRequest, errUnknownField)
			return nil, nil, false
		}
		columns = append(columns, name)
	}
	slices.Sort(columns)

	values := make([]any, len(columns))
	for i, name := range columns {
		value, err := decodeValue(fields[name], allowed[name])
		if err != nil {
			httpx.WriteError(w, http.StatusBadRequest, errInvalidBody)
			return nil, nil, false
		}
		values[i] = value
	}
	return columns, values, true
}

func decodeValue(raw json.RawMessage, kind Kind) (any, error) {
	isNull := bytes.Equal(bytes.TrimSpace(raw), nullLiteral)
	if isNull {
		if kind == Text || kind == Integer {
			return nil, errors.New("valeur null refusée")
		}
		return nil, nil
	}

	switch kind {
	case Text, NullText:
		var value string
		err := json.Unmarshal(raw, &value)
		return value, err
	case NullReal:
		var value float64
		err := json.Unmarshal(raw, &value)
		return value, err
	default:
		var value int64
		err := json.Unmarshal(raw, &value)
		return value, err
	}
}

func withColumn(columns map[string]Kind, name string, kind Kind) map[string]Kind {
	extended := make(map[string]Kind, len(columns)+1)
	for column, columnKind := range columns {
		extended[column] = columnKind
	}
	extended[name] = kind
	return extended
}

// WriteDBError traduit une erreur SQLite en statut HTTP.
func WriteDBError(w http.ResponseWriter, err error) {
	writeDBError(w, err)
}

func writeDBError(w http.ResponseWriter, err error) {
	var sqliteErr sqlite3.Error
	isSQLite := errors.As(err, &sqliteErr)

	switch {
	case errors.Is(err, sql.ErrNoRows):
		httpx.WriteError(w, http.StatusNotFound, errNotFound)
	case storage.IsConstraint(err, sqlite3.ErrConstraintUnique), storage.IsConstraint(err, sqlite3.ErrConstraintPrimaryKey):
		httpx.WriteError(w, http.StatusConflict, errUniqueConflict)
	// Toute autre contrainte (CHECK, NOT NULL, clé étrangère, type d'une table STRICT)
	// vient d'une donnée refusée : erreur du client, pas du serveur.
	case isSQLite && sqliteErr.Code == sqlite3.ErrConstraint:
		httpx.WriteError(w, http.StatusBadRequest, errConstraint)
	default:
		httpx.WriteError(w, http.StatusInternalServerError, errDatabase)
	}
}
