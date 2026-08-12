import { Text, type TextProps } from 'react-native';
import useCountUp from '../../hooks/useCountUp';

interface CountUpTextProps extends Omit<TextProps, 'children'> {
  target: number | null | undefined;
  active?: boolean;
  formatValue?: (value: number) => string;
}

/** Keeps high-frequency counter state inside the text leaf, not its screen. */
export default function CountUpText({
  target,
  active = true,
  formatValue,
  ...textProps
}: CountUpTextProps) {
  const value = useCountUp(target, active);
  return <Text {...textProps}>{formatValue ? formatValue(value) : value}</Text>;
}
