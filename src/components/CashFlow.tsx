import { StyleSheet, Text, View } from 'react-native';
import { Svg, Rect, Path } from 'react-native-svg';

type Coord = {
	x: number,
	y: number
}

/**
 * ```ts
 * <CashFlow
 *   x={X}
 *   y={Y}
 * />
 * ```
 * @param x number 
 * @param y number 
 * @returns Sankey Diagram
 * @author conspicio
 */
export default function CashFlow({ x, y }: Coord) {
	return (
		<Svg
			width={x}
			height={y}
			viewBox={`0 0 ${x} ${y}`}
			style={styles.cashFlow}
		>{
			<>
			<Rect
				x={50}              // Position X du coin supérieur gauche
				y={100}             // Position Y du coin supérieur gauche
				width={80}          // Largeur
				height={150}        // Hauteur
				fill="#4CAF50"      // Couleur de remplissage
				rx={5}              // Rayon des coins arrondis (optionnel)
				opacity={0.8}       // Transparence (0 à 1)
			/>
			<Path
				d="M 50 50 L 150 50 L 100 150 Z"
				fill="#2196F3"
				stroke="#000"
				strokeWidth={2}
			/>
			</>
		}</Svg>
	)
}

const styles = StyleSheet.create({
	cashFlow: {
		backgroundColor: 'rgba(214, 214, 214, 0.5)',
		borderRadius: 12,
		shadowColor: 'rgba(214, 214, 214, 0.8)'
	},
});
