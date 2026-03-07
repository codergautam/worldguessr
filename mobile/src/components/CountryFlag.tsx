import { Image, type ImageStyle, type StyleProp } from 'react-native';

interface CountryFlagProps {
  countryCode: string;
  size?: number;
  style?: StyleProp<ImageStyle>;
}

export default function CountryFlag({ countryCode, size = 24, style }: CountryFlagProps) {
  if (!countryCode || typeof countryCode !== 'string' || countryCode.length !== 2) {
    return null;
  }

  const code = countryCode.toLowerCase();
  const width = Math.round(size * 1.5);

  return (
    <Image
      source={{ uri: `https://flagcdn.com/w80/${code}.png` }}
      style={[{ width, height: size, borderRadius: 2 }, style]}
      resizeMode="cover"
    />
  );
}
