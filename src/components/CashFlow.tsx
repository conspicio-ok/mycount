import { StyleSheet, Text, View } from 'react-native';
import { Svg, Rect, Path, Line, G, Text as SvgText } from 'react-native-svg';

export type Entry = {
	id: number;
	gain: number;
	label?: string;
}

type Expense = {
	id: number;
	cost: number;
	duty: boolean;
	label?: string;
}

type FlowData = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  thickness: number;
  color: string;
};

const COLORS = {
	entry: '#5BE36CEE',
	expense: '#E36B5BEE',
	budget: '#09C81C88',
	none: 'rgb(214, 214, 214)',
};
const SPACING = 5;

function calculateEntryPositions(entries: Entry[], availableHeight: number, startY: number, gains_total: number)
	: Array<{ entry: Entry; y: number; height: number }>
{
	let currentY = startY - (entries.length - 1) * SPACING / 2;
	let entries_position: Array<{ entry: Entry; y: number; height: number }> = [];

	for (const entry of entries)
	{
		const height = (entry.gain / gains_total) * availableHeight;
		entries_position.push({ entry, y: currentY, height})
		currentY += height + SPACING;
	}
	return entries_position;
}

function calculateExpensePositions(expenses: Expense[], availableHeight: number, startY: number, expensesTotal: number)
	: Array<{ expense: Expense; y: number; height: number }>
{
	let currentY = startY;
	let expenses_position: Array<{ expense: Expense; y: number; height: number }> = [];

	for (const expense of expenses)
	{
		const height = (expense.cost / expensesTotal) * availableHeight;
		expenses_position.push({ expense, y: currentY, height})
		currentY += height;
	}
	return expenses_position;
}

function generateFlowPath(flow: FlowData)
	: string
{
	const { startX, startY, endX, endY, thickness } = flow;
	const controlX = (startX + endX) / 2;

	const topPath = `
		M ${startX} ${startY}
		C ${controlX} ${startY}, 
			${controlX} ${endY}, 
			${endX} ${endY}
	`;
  
	const bottomPath = `
		L ${endX} ${endY + thickness}
		C ${controlX} ${endY + thickness}, 
			${controlX} ${startY + thickness}, 
			${startX} ${startY + thickness}
		Z
	`;
  
  return topPath + bottomPath;
}

export default function CashFlow({ x, y, data }
	: { x: number; y: number, data: { entries: Entry[], expenses: Expense[]} })
{
	const PADDING = 16;

	let total = 0;
	for (const entry of data.entries)
		total += entry.gain;
	let gainsTotal = total

	total = 0;
	for (const expense of data.expenses)
		total += expense.cost;
	let expensesTotal = total;

	if (expensesTotal > gainsTotal)
	{
		data.entries.push({ id: 0, gain: expensesTotal - gainsTotal, label: "manque"})
		gainsTotal = expensesTotal
	}
	if (expensesTotal < gainsTotal)
	{
		data.expenses.push({ id: 0, cost: gainsTotal - expensesTotal, label: "reste", duty: false })
		expensesTotal = gainsTotal
	}
	
	const hasData = gainsTotal > 0 || expensesTotal > 0;
	const max_flow = data.entries.length > data.expenses.length ? data.entries.length : data.expenses.length;
	const availableHeight = y - PADDING * 2;
	const budgetLineX = x * 0.3;

	const entryPositions = gainsTotal > 0
		? calculateEntryPositions(data.entries, availableHeight, PADDING, gainsTotal)
		: [];
  
	const expensePositions = data.expenses.length > 0
		? calculateExpensePositions(data.expenses, availableHeight, PADDING, expensesTotal)
		: [];

	
	let entries_flow: FlowData[] = []
	let old_endY = 16;

	for (const entry_pos of entryPositions)
	{
		entries_flow.push({
			startX: 0,
			startY: entry_pos.y,
			endX: budgetLineX - 4,
			endY: old_endY,
			thickness: entry_pos.height,
			color: COLORS.entry
		});
		old_endY += entry_pos.height;
	}
	
	let expenses_flow: FlowData[] = []
	old_endY = PADDING - (data.expenses.length - 1) * SPACING / 2;

	for (const expense_pos of expensePositions)
	{
		expenses_flow.push({
			startX: budgetLineX + 4,
			startY: expense_pos.y,
			endX: x,
			endY: old_endY,
			thickness: expense_pos.height,
			color: COLORS.expense
		});
		old_endY += expense_pos.height + SPACING;
	}
  
	return (
		<View>
			<Svg
				width={x}
				height={y}
				viewBox={`0 0 ${x} ${y}`}
			>
        {/* Ligne budget centrale (verte) */}
			<Line
			x1={budgetLineX}
			y1={PADDING + max_flow / 2}
			x2={budgetLineX}
			y2={hasData ? PADDING + availableHeight - max_flow / 2 : y - PADDING}
			stroke={hasData ? COLORS.budget : COLORS.none}
			strokeWidth={8}
			strokeLinecap="round"
			/>
        
        {/* Flux entrées → budget */}
			{entries_flow.map((flow, index) => (
			<Path
				key={`entry-flow-${index}`}
				d={generateFlowPath(flow)}
				fill={flow.color}
				opacity={0.6}
			/>
			))}
        
        {/* Flux budget → sorties */}
			{expenses_flow.map((flow, index) => (
			<Path
				key={`expense-flow-${index}`}
				d={generateFlowPath(flow)}
				fill={flow.color}
				opacity={0.6}
			/>
			))}
        
        {/* Texte entrées (gauche) */}
			{entryPositions.map((pos) => (
			<G key={`entry-${pos.entry.id}`}>
				<SvgText
					x={PADDING + SPACING}
					y={pos.y + pos.height / 2}
					fill="black"
					fontSize={10}
					textAnchor="start"
				>
					{pos.entry.label || `${pos.entry.gain}€`}
				</SvgText>
			</G>
			))}
        
        {/* Texte sorties (droite) */}
			{expensePositions.map((pos) => (
			<G key={`expense-${pos.expense.id}`}>
				<SvgText
					x={x - PADDING - SPACING}
					y={pos.y + pos.height / 2}
					fill="black"
					fontSize={10}
					textAnchor="end"
				>
					{pos.expense.label || `${pos.expense.cost}€`}
				</SvgText>
			</G>
			))}
        
        {/* État vide */}
        {!hasData && (
          <SvgText
            x={x / 2}
            y={y / 2}
            fill="#999"
            fontSize={14}
            textAnchor="middle"
          >
            Aucune donnée
          </SvgText>
        )}
      </Svg>
    </View>
  );
}
