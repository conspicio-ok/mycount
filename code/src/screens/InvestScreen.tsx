import { useState, useEffect, useMemo, useCallback } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import ScreenHeader from '../components/ScreenHeader';
import Bubble from '../components/Bubble';
import BottomSheet from '../components/BottomSheet';
import PositionsTable from '../components/PositionsTable';
import { useDb } from '../db/DbContext';
import {
	getProfilsInvest, addProfilInvest, updateProfilInvestLabel, updateProfilInvestTaux,
	updateProfilInvestStyleAcquisition, updateProfilInvestCouleur, deleteProfilInvest, ProfilInvest,
	getActions, addAction, updateActionLabel, updateActionOrdre, updateActionPrix,
	updateActionNbPartAcquis, updateActionDiv, updateActionPrixInv, updateActionNbInv,
	deleteAction, Action,
	getVersementsDiv, addVersementDiv, removeVersementDiv, setAllVersementsDiv, clearVersementsDiv, VersementDiv,
	getBanned, addBanned, updateBannedLabel, updateBannedTexte, deleteBanned, Banned,
} from '../db/queries';
import { colors } from '../theme';
import { roundMoney } from '../utils/money';
import { computeRendNet, computeRendAn, investMensuelEuros, envelopeTauxGlobal } from '../utils/invest';

const ENV_COLORS = ['3c8ae0', 'e0b23c', '9c5cd6', '3ab08a', 'd6485c'];
const COLOR_PALETTE = ['3c8ae0', 'e0b23c', '9c5cd6', '3ab08a', 'd6485c', 'e0763c', '4cb8c4', '808080'];
const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jui', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export default function InvestScreen() {
	const db = useDb();

	const [profils, setProfils]			= useState<ProfilInvest[]>([]);
	const [selectedProfil, setSelectedProfil] = useState<number | null>(null);
	const [actions, setActions]			= useState<Action[]>([]);
	const [versements, setVersements]		= useState<VersementDiv[]>([]);

	const [editingPosition, setEditingPosition]		= useState<number | null>(null); // id_action
	const [editingEnvSettings, setEditingEnvSettings]	= useState<number | null>(null); // id_profil_inv

	const [banned, setBanned] = useState<Banned[]>([]);

	const [prixDrafts, setPrixDrafts]			= useState<Record<number, string>>({});
	const [divDrafts, setDivDrafts]			= useState<Record<number, string>>({});
	const [partsDrafts, setPartsDrafts]		= useState<Record<number, string>>({});
	const [prixInvDrafts, setPrixInvDrafts]	= useState<Record<number, string>>({});
	const [nbInvDrafts, setNbInvDrafts]		= useState<Record<number, string>>({});
	const [tauxDrafts, setTauxDrafts]			= useState<Record<number, string>>({});

	async function loadProfils() {
		const list = await getProfilsInvest(db);
		setProfils(list);
		if (selectedProfil === null && list.length > 0) {
			setSelectedProfil(list[0].id_profil_inv);
		}
	}

	async function loadActions() {
		setActions(await getActions(db));
	}

	async function loadVersements() {
		setVersements(await getVersementsDiv(db));
	}

	async function loadBanned() {
		setBanned(await getBanned(db));
	}

	useEffect(() => {
		loadProfils();
		loadActions();
		loadVersements();
		loadBanned();
	}, [])

	const envelope = profils.find((p) => p.id_profil_inv === selectedProfil) ?? null;
	const settingsEnvelope = editingEnvSettings != null ? profils.find((p) => p.id_profil_inv === editingEnvSettings) ?? null : null;
	const position = editingPosition != null ? actions.find((a) => a.id_action === editingPosition) ?? null : null;
	const positionEnvelope = position ? profils.find((p) => p.id_profil_inv === position.id_profil_inv) ?? null : null;

	// useMemo/useCallback ici : PositionsTable est mémoïsé (React.memo) pour ne pas se
	// re-rendre (coûteux, DraggableFlatList) à chaque frappe dans un champ sans rapport
	// (ex: les sections "À éviter") — il faut donc lui passer des props à référence stable.
	const positions = useMemo(
		() => envelope ? actions.filter((a) => a.id_profil_inv === envelope.id_profil_inv).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)) : [],
		[actions, envelope]
	);
	const moisByAction = useMemo(() => {
		const map: Record<number, number[]> = {};
		for (const v of versements) {
			(map[v.id_action] ??= []).push(v.mois);
		}
		for (const id in map) map[id].sort((a, b) => a - b);
		return map;
	}, [versements]);
	const moisForAction = (id_action: number) => moisByAction[id_action] ?? [];

	const investTotalMensuel = roundMoney(
		profils.reduce((sum, p) => sum + actions.filter((a) => a.id_profil_inv === p.id_profil_inv).reduce((s, a) => s + investMensuelEuros(a, p.style_acquisition), 0), 0)
	);
	const selEnvInvest = envelope
		? roundMoney(positions.reduce((sum, a) => sum + investMensuelEuros(a, envelope.style_acquisition), 0))
		: 0;

	async function handleAddProfil() {
		const couleur = ENV_COLORS[profils.length % ENV_COLORS.length];
		const id = await addProfilInvest(db, 'Nouvelle enveloppe', 0, 'montant', couleur);
		await loadProfils();
		setSelectedProfil(id);
	}

	function handleProfilLabelChange(id: number, text: string) {
		setProfils((prev) => prev.map((p) => (p.id_profil_inv === id ? { ...p, label: text } : p)));
		updateProfilInvestLabel(db, id, text);
	}

	function handleTauxChange(id: number, text: string) {
		setTauxDrafts((prev) => ({ ...prev, [id]: text }));
		const parsed = text === '' ? 0 : Number(text.replace(',', '.'));
		if (isNaN(parsed)) return;
		setProfils((prev) => prev.map((p) => (p.id_profil_inv === id ? { ...p, taux: parsed } : p)));
		updateProfilInvestTaux(db, id, parsed);
	}

	function handleCouleurChange(id: number, couleur: string) {
		setProfils((prev) => prev.map((p) => (p.id_profil_inv === id ? { ...p, couleur } : p)));
		updateProfilInvestCouleur(db, id, couleur);
	}

	function handleStyleAcquisitionChange(id: number, style: 'montant' | 'parts') {
		setProfils((prev) => prev.map((p) => (p.id_profil_inv === id ? { ...p, style_acquisition: style } : p)));
		updateProfilInvestStyleAcquisition(db, id, style);
	}

	function handleRemoveProfil() {
		if (editingEnvSettings == null) return;
		const id = editingEnvSettings;
		Alert.alert(
			'Supprimer cette enveloppe ?',
			'Toutes ses positions seront supprimées. Cette action est irréversible.',
			[
				{ text: 'Annuler', style: 'cancel' },
				{
					text: 'Supprimer',
					style: 'destructive',
					onPress: async () => {
						try {
							await deleteProfilInvest(db, id);
							await loadProfils();
							await loadActions();
							if (selectedProfil === id) {
								setSelectedProfil(profils.find((p) => p.id_profil_inv !== id)?.id_profil_inv ?? null);
							}
							setEditingEnvSettings(null);
						} catch {
							Alert.alert('Erreur', "La suppression a échoué.");
						}
					},
				},
			]
		);
	}

	async function handleAddPosition() {
		if (selectedProfil === null) return;
		const maxOrdre = positions.reduce((max, a) => Math.max(max, a.ordre ?? -1), -1);
		const id_action = await addAction(db, 'Nouvelle position', selectedProfil, maxOrdre + 1);
		await loadActions();
		setEditingPosition(id_action);
	}

	function handleLabelChange(id_action: number, text: string) {
		setActions((prev) => prev.map((a) => (a.id_action === id_action ? { ...a, label: text } : a)));
		updateActionLabel(db, id_action, text);
	}

	function handlePrixChange(id_action: number, text: string) {
		setPrixDrafts((prev) => ({ ...prev, [id_action]: text }));
		const parsed = text === '' ? null : Number(text.replace(',', '.'));
		if (parsed !== null && isNaN(parsed)) return;
		setActions((prev) => prev.map((a) => (a.id_action === id_action ? { ...a, prix: parsed } : a)));
		updateActionPrix(db, id_action, parsed);
	}

	function handleDivChange(id_action: number, text: string) {
		setDivDrafts((prev) => ({ ...prev, [id_action]: text }));
		const parsed = text === '' ? null : Number(text.replace(',', '.'));
		if (parsed !== null && isNaN(parsed)) return;
		setActions((prev) => prev.map((a) => (a.id_action === id_action ? { ...a, div: parsed } : a)));
		updateActionDiv(db, id_action, parsed);
	}

	function handlePartsChange(id_action: number, text: string) {
		setPartsDrafts((prev) => ({ ...prev, [id_action]: text }));
		const parsed = text === '' ? 0 : Number(text.replace(',', '.'));
		if (isNaN(parsed)) return;
		setActions((prev) => prev.map((a) => (a.id_action === id_action ? { ...a, nb_part_acquis: parsed } : a)));
		updateActionNbPartAcquis(db, id_action, parsed);
	}

	function handlePrixInvChange(id_action: number, text: string) {
		setPrixInvDrafts((prev) => ({ ...prev, [id_action]: text }));
		const parsed = text === '' ? 0 : Number(text.replace(',', '.'));
		if (isNaN(parsed)) return;
		setActions((prev) => prev.map((a) => (a.id_action === id_action ? { ...a, prix_inv: parsed } : a)));
		updateActionPrixInv(db, id_action, parsed);
	}

	function handleNbInvChange(id_action: number, text: string) {
		setNbInvDrafts((prev) => ({ ...prev, [id_action]: text }));
		const parsed = text === '' ? 0 : Number(text.replace(',', '.'));
		if (isNaN(parsed)) return;
		setActions((prev) => prev.map((a) => (a.id_action === id_action ? { ...a, nb_inv: parsed } : a)));
		updateActionNbInv(db, id_action, parsed);
	}

	const handleReorderPositions = useCallback(async (data: Action[]) => {
		setActions((prev) => [...prev.filter((a) => a.id_profil_inv !== selectedProfil), ...data]);
		await Promise.all(data.map((a, index) => updateActionOrdre(db, a.id_action, index)));
	}, [selectedProfil, db]);

	function handleRemovePosition() {
		if (editingPosition == null) return;
		const id_action = editingPosition;
		Alert.alert(
			'Supprimer cette position ?',
			'Cette action est irréversible.',
			[
				{ text: 'Annuler', style: 'cancel' },
				{
					text: 'Supprimer',
					style: 'destructive',
					onPress: async () => {
						await deleteAction(db, id_action);
						await loadActions();
						await loadVersements();
						setEditingPosition(null);
					},
				},
			]
		);
	}

	async function toggleMonth(id_action: number, month: number) {
		const active = moisForAction(id_action).includes(month);
		if (active) {
			setVersements((prev) => prev.filter((v) => !(v.id_action === id_action && v.mois === month)));
			await removeVersementDiv(db, id_action, month);
		} else {
			setVersements((prev) => [...prev, { id_action, mois: month }]);
			await addVersementDiv(db, id_action, month);
		}
	}

	async function setAllMonths(id_action: number) {
		setVersements((prev) => [...prev.filter((v) => v.id_action !== id_action), ...ALL_MONTHS.map((mois) => ({ id_action, mois }))]);
		await setAllVersementsDiv(db, id_action, ALL_MONTHS);
	}

	async function clearAllMonths(id_action: number) {
		setVersements((prev) => prev.filter((v) => v.id_action !== id_action));
		await clearVersementsDiv(db, id_action);
	}

	async function handleAddBannedSection() {
		const label = 'Nouvelle section';
		const id_banned = await addBanned(db, label, '');
		setBanned((prev) => [...prev, { id_banned, label, texte: '' }]);
	}

	function handleBannedLabelChange(id_banned: number, label: string) {
		setBanned((prev) => prev.map((b) => (b.id_banned === id_banned ? { ...b, label } : b)));
		updateBannedLabel(db, id_banned, label);
	}

	function handleBannedTexteChange(id_banned: number, texte: string) {
		setBanned((prev) => prev.map((b) => (b.id_banned === id_banned ? { ...b, texte } : b)));
		updateBannedTexte(db, id_banned, texte);
	}

	function handleRemoveBannedSection(id_banned: number) {
		Alert.alert(
			'Supprimer cette section ?',
			'Cette action est irréversible.',
			[
				{ text: 'Annuler', style: 'cancel' },
				{
					text: 'Supprimer',
					style: 'destructive',
					onPress: async () => {
						await deleteBanned(db, id_banned);
						setBanned((prev) => prev.filter((b) => b.id_banned !== id_banned));
					},
				},
			]
		);
	}

	if (!envelope) {
		return (
			<ScrollView contentContainerStyle={styles.container}>
				<ScreenHeader title="Investir" />
				<TouchableOpacity style={styles.addTab} onPress={handleAddProfil}>
					<Text style={styles.addTabText}>+ Ajouter une enveloppe</Text>
				</TouchableOpacity>
			</ScrollView>
		);
	}

	const positionMois = position ? moisForAction(position.id_action) : [];

	return (
		<KeyboardAvoidingView
			style={styles.flex}
			behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			keyboardVerticalOffset={0}
		>
		<ScrollView contentContainerStyle={styles.container}>
			<ScreenHeader title="Investir" />

			<View style={styles.totalBanner}>
				<Text style={styles.totalBannerLabel}>Investissement / mois (total)</Text>
				<Text style={styles.totalBannerValue}>{investTotalMensuel} €</Text>
			</View>
			<Text style={styles.caption}>Somme des versements par enveloppe · reliée au budget</Text>

			<ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow} contentContainerStyle={styles.tabsRowContent}>
				{profils.map((p) => {
					const active = p.id_profil_inv === selectedProfil;
					const tint = `#${p.couleur ?? '808080'}`;
					return (
						<TouchableOpacity
							key={p.id_profil_inv}
							style={[styles.tab, { backgroundColor: active ? tint : `${tint}26` }]}
							onPress={() => setSelectedProfil(p.id_profil_inv)}
						>
							<Text style={[styles.tabText, { color: active ? colors.white : tint }]}>{p.label}</Text>
						</TouchableOpacity>
					);
				})}
				<TouchableOpacity style={styles.addTab} onPress={handleAddProfil}>
					<Text style={styles.addTabText}>+ Enveloppe</Text>
				</TouchableOpacity>
			</ScrollView>

			<View style={styles.settingsRow}>
				<Text style={styles.settingsLabel}>Imposition {envelope.taux}%</Text>
				<TouchableOpacity style={styles.settingsButton} onPress={() => setEditingEnvSettings(envelope.id_profil_inv)}>
					<Text style={styles.settingsButtonText}>⚙ Réglages</Text>
				</TouchableOpacity>
			</View>

			<Bubble style={styles.investRow}>
				<Text style={styles.investRowLabel}>Investissement / mois</Text>
				<Text style={[styles.investRowValue, { color: `#${envelope.couleur ?? '808080'}` }]}>
					{selEnvInvest} €
				</Text>
			</Bubble>
			<Text style={styles.caption}>Somme des versements mensuels des positions ci-dessous</Text>

			<PositionsTable
				positions={positions}
				taux={envelope.taux ?? 0}
				couleur={envelope.couleur ?? '808080'}
				moisByAction={moisByAction}
				onSelectPosition={setEditingPosition}
				onReorder={handleReorderPositions}
			/>
			<TouchableOpacity style={styles.addRow} onPress={handleAddPosition}>
				<Text style={styles.addRowText}>+ Ajouter une position</Text>
			</TouchableOpacity>
			<Text style={styles.caption}>Touchez une ligne pour éditer prix, dividende, mois…</Text>

			<Text style={styles.sectionTitle}>À éviter</Text>
			<Text style={styles.sectionSubtitle}>Notez ici les titres déjà étudiés que vous ne voulez pas suivre</Text>

			{banned.map((b) => (
				<Bubble key={b.id_banned} style={[styles.bannedBox, styles.bannedBoxSpaced]}>
					<View style={styles.bannedHeader}>
						<TextInput
							style={styles.bannedLabelInput}
							value={b.label}
							onChangeText={(text) => handleBannedLabelChange(b.id_banned, text)}
							placeholder="Titre de la section"
							placeholderTextColor={colors.textSecondary}
						/>
						<TouchableOpacity onPress={() => handleRemoveBannedSection(b.id_banned)} hitSlop={8}>
							<Text style={styles.removeText}>×</Text>
						</TouchableOpacity>
					</View>
					<TextInput
						style={styles.bannedInput}
						value={b.texte ?? ''}
						onChangeText={(text) => handleBannedTexteChange(b.id_banned, text)}
						placeholder="Ex: Air Liquide (trop chère), ETF X (frais élevés), …"
						placeholderTextColor={colors.textSecondary}
						multiline
					/>
				</Bubble>
			))}
			<TouchableOpacity style={styles.addRow} onPress={handleAddBannedSection}>
				<Text style={styles.addRowText}>+ Ajouter une section</Text>
			</TouchableOpacity>

			<Text style={styles.sectionTitle}>Taux de rendement global</Text>
			<Text style={styles.sectionSubtitle}>Rendement net pondéré par le capital investi de chaque enveloppe — sert de base à la Projection</Text>
			<View style={styles.tauxGrid}>
				{profils.map((p) => (
					<Bubble key={p.id_profil_inv} style={styles.tauxCard}>
						<View style={styles.tauxCardHeader}>
							<View style={[styles.dot, { backgroundColor: `#${p.couleur ?? '808080'}` }]} />
							<Text style={styles.tauxCardLabel}>{p.label}</Text>
						</View>
						<Text style={[styles.tauxCardValue, { color: `#${p.couleur ?? '808080'}` }]}>
							{envelopeTauxGlobal(actions, p, moisByAction)}%
						</Text>
					</Bubble>
				))}
			</View>

			<BottomSheet visible={!!position} onClose={() => setEditingPosition(null)}>
				{position && positionEnvelope && (
					<>
						<View style={styles.sheetHeader}>
							<View style={{ backgroundColor: `#${positionEnvelope.couleur ?? '808080'}` }} />
							<TextInput
								style={styles.sheetTitleInput}
								value={position.label}
								onChangeText={(text) => handleLabelChange(position.id_action, text)}
							/>
							<TouchableOpacity onPress={() => setEditingPosition(null)} hitSlop={8}>
								<Text style={styles.closeButton}>×</Text>
							</TouchableOpacity>
						</View>

						<View style={styles.fieldsGrid}>
							<View style={styles.fieldHalf}>
								<Text style={styles.fieldLabel}>Prix</Text>
								<TextInput
									style={styles.fieldInput}
									value={prixDrafts[position.id_action] ?? (position.prix === null ? '' : String(position.prix))}
									onChangeText={(text) => handlePrixChange(position.id_action, text)}
									keyboardType="decimal-pad"
									placeholder="0"
								/>
							</View>
							<View style={styles.fieldHalf}>
								<Text style={styles.fieldLabel}>Déjà acquis (parts)</Text>
								<TextInput
									style={styles.fieldInput}
									value={partsDrafts[position.id_action] ?? String(position.nb_part_acquis ?? 0)}
									onChangeText={(text) => handlePartsChange(position.id_action, text)}
									keyboardType="decimal-pad"
									placeholder="0"
								/>
							</View>
							<View style={styles.fieldHalf}>
								<Text style={styles.fieldLabel}>Dividende (1 versement)</Text>
								<TextInput
									style={styles.fieldInput}
									value={divDrafts[position.id_action] ?? (position.div === null ? '' : String(position.div))}
									onChangeText={(text) => handleDivChange(position.id_action, text)}
									keyboardType="decimal-pad"
									placeholder="0"
								/>
							</View>
							<View style={styles.fieldHalf}>
								<Text style={styles.fieldLabel}>
									Investissement / mois {positionEnvelope.style_acquisition === 'parts' ? '(parts)' : '(€)'}
								</Text>
								{positionEnvelope.style_acquisition === 'montant' ? (
									<TextInput
										style={styles.fieldInput}
										value={prixInvDrafts[position.id_action] ?? String(position.prix_inv ?? 0)}
										onChangeText={(text) => handlePrixInvChange(position.id_action, text)}
										keyboardType="decimal-pad"
										placeholder="0"
									/>
								) : (
									<TextInput
										style={styles.fieldInput}
										value={nbInvDrafts[position.id_action] ?? String(position.nb_inv ?? 0)}
										onChangeText={(text) => handleNbInvChange(position.id_action, text)}
										keyboardType="decimal-pad"
										placeholder="0"
									/>
								)}
							</View>
						</View>

						<View style={styles.monthsHeader}>
							<Text style={styles.monthsTitle}>Mois de versement · {positionMois.length}×/an</Text>
							<View style={styles.monthsActions}>
								<TouchableOpacity onPress={() => setAllMonths(position.id_action)}>
									<Text style={[styles.monthsActionText, { color: `#${positionEnvelope.couleur ?? '808080'}` }]}>Tous</Text>
								</TouchableOpacity>
								<TouchableOpacity onPress={() => clearAllMonths(position.id_action)}>
									<Text style={styles.monthsActionText}>Aucun</Text>
								</TouchableOpacity>
							</View>
						</View>
						<View style={styles.monthsGrid}>
							{MONTH_LABELS.map((label, index) => {
								const month = index + 1;
								const active = positionMois.includes(month);
								return (
									<TouchableOpacity
										key={month}
										style={[styles.monthChip, active && { backgroundColor: `#${positionEnvelope.couleur ?? '808080'}` }]}
										onPress={() => toggleMonth(position.id_action, month)}
									>
										<Text style={[styles.monthChipText, active && { color: colors.white }]}>{label}</Text>
									</TouchableOpacity>
								);
							})}
						</View>

						<View style={styles.computedBox}>
							<View style={styles.computedRow}>
								<Text style={styles.computedLabel}>Dividende annuel (versement × fréq.)</Text>
								<Text style={styles.computedValue}>{roundMoney((position.div ?? 0) * positionMois.length)} €</Text>
							</View>
							<View style={styles.computedRow}>
								<Text style={styles.computedLabel}>Rendement net</Text>
								<Text style={[styles.computedValue, { color: `#${positionEnvelope.couleur ?? '808080'}` }]}>{computeRendNet(position, positionMois.length, positionEnvelope.taux ?? 0)}%</Text>
							</View>
							<View style={styles.computedRow}>
								<Text style={styles.computedLabel}>Valeur acquise (prix × parts)</Text>
								<Text style={styles.computedValue}>{roundMoney((position.prix ?? 0) * (position.nb_part_acquis ?? 0))} €</Text>
							</View>
							<View style={[styles.computedRow, styles.computedRowLast]}>
								<Text style={styles.computedLabel}>Rendement / an (net d'impôt)</Text>
								<Text style={[styles.computedValue, { color: colors.accent }]}>{computeRendAn(position, positionMois.length, positionEnvelope.taux ?? 0)} €</Text>
							</View>
						</View>

						<TouchableOpacity style={styles.removeButton} onPress={handleRemovePosition}>
							<Text style={styles.removeButtonText}>Supprimer cette position</Text>
						</TouchableOpacity>
					</>
				)}
			</BottomSheet>

			<BottomSheet visible={!!settingsEnvelope} onClose={() => setEditingEnvSettings(null)}>
				{settingsEnvelope && (
					<>
						<View style={styles.sheetHeader}>
							<View style={[styles.colorDot, { backgroundColor: `#${settingsEnvelope.couleur ?? '808080'}` }]} />
							<Text style={styles.sheetTitle}>Réglages enveloppe</Text>
							<TouchableOpacity onPress={() => setEditingEnvSettings(null)} hitSlop={8}>
								<Text style={styles.closeButton}>×</Text>
							</TouchableOpacity>
						</View>

						<Text style={styles.fieldLabel}>Nom</Text>
						<TextInput
							style={[styles.fieldInput, styles.fieldInputWide]}
							value={settingsEnvelope.label}
							onChangeText={(text) => handleProfilLabelChange(settingsEnvelope.id_profil_inv, text)}
						/>

						<Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Couleur</Text>
						<View style={styles.swatchesRow}>
							{COLOR_PALETTE.map((hex) => (
								<TouchableOpacity
									key={hex}
									style={[
										styles.swatch,
										{ backgroundColor: `#${hex}` },
										settingsEnvelope.couleur === hex && styles.swatchActive,
									]}
									onPress={() => handleCouleurChange(settingsEnvelope.id_profil_inv, hex)}
								/>
							))}
						</View>

						<Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Taux d'imposition sur dividendes</Text>
						<View style={styles.taxRow}>
							<TextInput
								style={styles.taxInput}
								value={tauxDrafts[settingsEnvelope.id_profil_inv] ?? String(settingsEnvelope.taux ?? 0)}
								onChangeText={(text) => handleTauxChange(settingsEnvelope.id_profil_inv, text)}
								keyboardType="decimal-pad"
							/>
							<Text style={styles.taxSuffix}>%</Text>
						</View>
						<Text style={styles.sectionSubtitle}>Ex : PEA 17,2% (prélèvements sociaux) · Compte-titres 30% (flat tax)</Text>

						<Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Style d'acquisition</Text>
						<View style={styles.styleToggleRow}>
							<TouchableOpacity
								style={[
									styles.styleToggleButton,
									settingsEnvelope.style_acquisition === 'montant' && { backgroundColor: `#${settingsEnvelope.couleur ?? '808080'}` },
								]}
								onPress={() => handleStyleAcquisitionChange(settingsEnvelope.id_profil_inv, 'montant')}
							>
								<Text style={[
									styles.styleToggleText,
									settingsEnvelope.style_acquisition === 'montant' && styles.styleToggleTextActive,
								]}>Montant (€)</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={[
									styles.styleToggleButton,
									settingsEnvelope.style_acquisition === 'parts' && { backgroundColor: `#${settingsEnvelope.couleur ?? '808080'}` },
								]}
								onPress={() => handleStyleAcquisitionChange(settingsEnvelope.id_profil_inv, 'parts')}
							>
								<Text style={[
									styles.styleToggleText,
									settingsEnvelope.style_acquisition === 'parts' && styles.styleToggleTextActive,
								]}>Parts</Text>
							</TouchableOpacity>
						</View>
						<Text style={styles.sectionSubtitle}>Détermine si l'investissement mensuel des positions se saisit en € ou en nombre de parts</Text>

						<TouchableOpacity style={styles.removeButton} onPress={handleRemoveProfil}>
							<Text style={styles.removeButtonText}>Supprimer l'enveloppe</Text>
						</TouchableOpacity>
					</>
				)}
			</BottomSheet>
		</ScrollView>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	flex: {
		flex: 1,
	},
	container: {
		padding: 20,
		gap: 4,
	},
	totalBanner: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginTop: 14,
		padding: 14,
		backgroundColor: colors.highlightText,
		borderWidth: 1.5,
		borderColor: colors.highlight,
		borderRadius: 16,
	},
	totalBannerLabel: {
		fontSize: 14,
		fontWeight: '600',
		color: colors.highlight,
	},
	totalBannerValue: {
		fontSize: 18,
		fontWeight: '700',
		color: colors.highlight,
	},
	caption: {
		fontSize: 11,
		color: colors.textSecondary,
		marginTop: 6,
		textAlign: 'center',
	},
	tabsRow: {
		marginTop: 20,
	},
	tabsRowContent: {
		gap: 8,
		paddingBottom: 4,
	},
	tab: {
		paddingVertical: 8,
		paddingHorizontal: 16,
		borderRadius: 12,
	},
	tabText: {
		fontSize: 14,
		fontWeight: '700',
	},
	addTab: {
		paddingVertical: 8,
		paddingHorizontal: 14,
		borderRadius: 12,
		borderWidth: 1.5,
		borderColor: colors.border,
		borderStyle: 'dashed',
		justifyContent: 'center',
	},
	addTabText: {
		fontSize: 13,
		fontWeight: '700',
		color: colors.textSecondary,
	},
	settingsRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginTop: 12,
	},
	settingsLabel: {
		fontSize: 13,
		fontWeight: '600',
		color: colors.textSecondary,
	},
	settingsButton: {
		paddingVertical: 6,
		paddingHorizontal: 10,
		borderRadius: 10,
		backgroundColor: colors.divider,
	},
	settingsButtonText: {
		fontSize: 13,
		fontWeight: '600',
		color: colors.textPrimary,
	},
	investRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginTop: 10,
		paddingVertical: 12,
	},
	investRowLabel: {
		fontSize: 14,
		fontWeight: '600',
		color: colors.textPrimary,
	},
	investRowValue: {
		fontSize: 16,
		fontWeight: '700',
	},
	addRow: {
		marginTop: 10,
		paddingVertical: 12,
		borderWidth: 1.5,
		borderColor: colors.border,
		borderStyle: 'dashed',
		borderRadius: 16,
		alignItems: 'center',
	},
	addRowText: {
		fontSize: 14,
		fontWeight: '600',
		color: colors.textSecondary,
	},
	sectionTitle: {
		fontSize: 13,
		fontWeight: '600',
		color: colors.textSecondary,
		textTransform: 'uppercase',
		letterSpacing: 0.4,
		marginTop: 26,
	},
	sectionSubtitle: {
		fontSize: 12,
		color: colors.textSecondary,
		marginTop: 4,
	},
	tauxGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 12,
		marginTop: 12,
	},
	tauxCard: {
		width: '47%',
		paddingVertical: 14,
	},
	tauxCardHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	dot: {
		width: 10,
		height: 10,
		borderRadius: 3,
	},
	tauxCardLabel: {
		flex: 1,
		fontSize: 13,
		fontWeight: '600',
		color: colors.textSecondary,
	},
	tauxCardValue: {
		fontSize: 22,
		fontWeight: '700',
		marginTop: 6,
	},
	bannedBox: {
		marginTop: 10,
		paddingVertical: 14,
	},
	bannedBoxSpaced: {
		marginTop: 10,
	},
	bannedHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	bannedLabelInput: {
		flex: 1,
		fontSize: 13,
		fontWeight: '700',
		color: colors.textSecondary,
		padding: 0,
	},
	bannedInput: {
		marginTop: 8,
		minHeight: 70,
		fontSize: 14,
		color: colors.textPrimary,
		textAlignVertical: 'top',
	},
	removeText: {
		fontSize: 16,
		color: colors.textSecondary,
		paddingHorizontal: 4,
	},
	sheetHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		marginBottom: 16,
	},
	colorDot: {
		width: 12,
		height: 12,
		borderRadius: 4,
	},
	sheetTitleInput: {
		flex: 1,
		fontSize: 20,
		fontWeight: '700',
		color: colors.textPrimary,
		padding: 0,
	},
	sheetTitle: {
		flex: 1,
		fontSize: 20,
		fontWeight: '700',
		color: colors.textPrimary,
	},
	closeButton: {
		fontSize: 20,
		color: colors.textSecondary,
		paddingHorizontal: 4,
	},
	fieldsGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 12,
	},
	fieldHalf: {
		width: '47%',
	},
	fieldLabel: {
		fontSize: 11,
		fontWeight: '600',
		color: colors.textSecondary,
		textTransform: 'uppercase',
	},
	fieldLabelSpaced: {
		marginTop: 20,
	},
	fieldInput: {
		marginTop: 4,
		borderBottomWidth: 1.5,
		borderBottomColor: colors.divider,
		paddingVertical: 4,
		fontSize: 16,
		fontWeight: '600',
		color: colors.textPrimary,
	},
	fieldInputWide: {
		fontSize: 17,
	},
	monthsHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginTop: 20,
	},
	monthsTitle: {
		fontSize: 12,
		fontWeight: '700',
		color: colors.textSecondary,
		textTransform: 'uppercase',
	},
	monthsActions: {
		flexDirection: 'row',
		gap: 12,
	},
	monthsActionText: {
		fontSize: 12,
		fontWeight: '700',
		color: colors.textSecondary,
	},
	monthsGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 6,
		marginTop: 10,
	},
	monthChip: {
		width: '15%',
		paddingVertical: 8,
		borderRadius: 9,
		backgroundColor: colors.divider,
		alignItems: 'center',
	},
	monthChipText: {
		fontSize: 12,
		fontWeight: '600',
		color: colors.textPrimary,
	},
	computedBox: {
		marginTop: 22,
		backgroundColor: colors.accentBg,
		borderRadius: 16,
		paddingHorizontal: 16,
	},
	computedRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.divider,
	},
	computedRowLast: {
		borderBottomWidth: 0,
	},
	computedLabel: {
		fontSize: 14,
		color: colors.textSecondary,
		flex: 1,
	},
	computedValue: {
		fontSize: 15,
		fontWeight: '700',
		color: colors.textPrimary,
	},
	taxRow: {
		flexDirection: 'row',
		alignItems: 'baseline',
		gap: 3,
		marginTop: 4,
		borderBottomWidth: 1.5,
		borderBottomColor: colors.divider,
	},
	taxInput: {
		fontSize: 17,
		fontWeight: '700',
		color: colors.textPrimary,
		paddingVertical: 4,
		width: 80,
	},
	taxSuffix: {
		fontSize: 15,
		color: colors.textSecondary,
	},
	styleToggleRow: {
		flexDirection: 'row',
		gap: 8,
		marginTop: 8,
	},
	styleToggleButton: {
		flex: 1,
		paddingVertical: 10,
		borderRadius: 12,
		backgroundColor: colors.divider,
		alignItems: 'center',
	},
	styleToggleText: {
		fontSize: 14,
		fontWeight: '700',
		color: colors.textSecondary,
	},
	styleToggleTextActive: {
		color: colors.white,
	},
	swatchesRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 10,
		marginTop: 8,
	},
	swatch: {
		width: 30,
		height: 30,
		borderRadius: 9,
		borderWidth: 2,
		borderColor: 'transparent',
	},
	swatchActive: {
		borderColor: colors.textPrimary,
	},
	removeButton: {
		marginTop: 24,
		paddingVertical: 13,
		borderRadius: 14,
		borderWidth: 1.5,
		borderColor: '#e08a8a',
		alignItems: 'center',
	},
	removeButtonText: {
		fontSize: 15,
		fontWeight: '700',
		color: '#c0405a',
	},
});
