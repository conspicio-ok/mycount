import { View } from "react-native";
// import { mixC}

export default function Card({ x, shade, children }: { x: number, shade?: string, children: any})
{
    if (x)
    return (
        <View style={{
            backgroundColor: 'rgba(214, 214, 214, 0.5)',
            borderRadius: 8,
            margin: 8,
            padding: 8,
            width: x
        }}>
            {children}
        </View>
    )
}