package storage

import (
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"os"
	"sync"

	"github.com/mattn/go-sqlite3"
)

const (
	defaultDBPath = "/data/mycount.db"

	// Appliqués par le driver à chaque connexion ouverte :
	// - clés étrangères actives, désactivées par défaut dans SQLite ;
	// - WAL : les lectures ne bloquent plus l'écriture ;
	// - synchronous NORMAL : sûr en WAL, bien moins de fsync que FULL ;
	// - busy_timeout : attendre un verrou 5 s plutôt qu'échouer tout de suite ;
	// - txlock immediate : une transaction prend le verrou d'écriture dès BEGIN,
	//   ce qui évite l'échec d'une lecture promue en écriture sous concurrence.
	dsnOptions = "?_foreign_keys=on&_journal_mode=WAL&_synchronous=NORMAL&_busy_timeout=5000&_txlock=immediate"

	// Base en RAM, perdue à l'arrêt du serveur : rien d'y survit, c'est voulu (bannissements).
	// cache=shared : toutes les connexions du processus voient la même base.
	memoryDSN = "file:mycount-memory?mode=memory&cache=shared"
)

//go:embed schema.sql
var schema string

//go:embed memory.sql
var memorySchema string

var (
	db    *sql.DB
	memDB *sql.DB
	stmts sync.Map // SQL → *sql.Stmt
)

// Init ouvre la base et applique le schéma.
func Init() error {
	path := os.Getenv("DB_PATH")
	if path == "" {
		path = defaultDBPath
	}

	var err error
	db, err = sql.Open("sqlite3", "file:"+path+dsnOptions)
	if err != nil {
		return fmt.Errorf("ouverture de %s : %w", path, err)
	}
	if err := db.Ping(); err != nil {
		return fmt.Errorf("connexion à %s : %w", path, err)
	}
	if _, err := db.Exec(schema); err != nil {
		return fmt.Errorf("application du schéma : %w", err)
	}

	memDB, err = sql.Open("sqlite3", memoryDSN)
	if err != nil {
		return fmt.Errorf("ouverture de la base mémoire : %w", err)
	}
	// Une seule connexion, jamais fermée : une base mémoire disparaît avec sa dernière
	// connexion, et le cache partagé renverrait SQLITE_LOCKED sous écritures concurrentes.
	memDB.SetMaxOpenConns(1)
	memDB.SetMaxIdleConns(1)
	if _, err := memDB.Exec(memorySchema); err != nil {
		return fmt.Errorf("application du schéma mémoire : %w", err)
	}
	return nil
}

// DB renvoie la connexion partagée.
func DB() *sql.DB {
	return db
}

// MemDB renvoie la base en RAM (tables éphémères).
func MemDB() *sql.DB {
	return memDB
}

// Stmt renvoie la requête préparée pour ce SQL : préparée au premier appel, réutilisée
// ensuite. *sql.Stmt est sûr en concurrence et se re-prépare seul sur chaque connexion.
func Stmt(query string) (*sql.Stmt, error) {
	if cached, ok := stmts.Load(query); ok {
		return cached.(*sql.Stmt), nil
	}

	prepared, err := db.Prepare(query)
	if err != nil {
		return nil, err
	}

	actual, loaded := stmts.LoadOrStore(query, prepared)
	if loaded {
		_ = prepared.Close()
	}
	return actual.(*sql.Stmt), nil
}

// IsConstraint indique si err est une violation de contrainte SQLite du code étendu donné.
func IsConstraint(err error, code sqlite3.ErrNoExtended) bool {
	var sqliteErr sqlite3.Error
	return errors.As(err, &sqliteErr) && sqliteErr.ExtendedCode == code
}
