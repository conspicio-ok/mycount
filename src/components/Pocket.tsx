import { useState, useEffect } from 'react';
import { Text, View, TextInput, Button } from 'react-native';

export default function Pocket({ label, pValue }: { label: string, pValue: number })
{
	const [value, setValue] = useState<number>(pValue)

	useEffect(() => {
        setValue(pValue);
    }, [pValue]);

	if (!label) return null
	return (
		<View style={{
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'space-between',
			paddingLeft: 8,
			paddingRight: 8
		}}>
			<Text>{label}</Text>
			<View style={{
				flexDirection: 'row',
				alignItems: 'center',
				justifyContent: 'flex-end',
				gap: 16
			}}>
			<TextInput
				value={String(value)}
				onChangeText={e => {
					if (e === '')
					{
						setValue(0)
						return
					}
					const parsed = parseInt(e, 10)
					if (!isNaN(parsed)) setValue(parsed)
				}}
				keyboardType="numeric"
			/>
			{ value != pValue && (
				<Button
					title='Save'
					onPress={() => {}}
				/>
			)}
			</View>
		</View>
	)
}