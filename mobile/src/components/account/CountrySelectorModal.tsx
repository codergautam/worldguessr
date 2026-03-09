import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Modal,
  ActivityIndicator,
  StyleSheet,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { api } from '../../services/api';
import * as countryCodes from 'countries-code';

const VALID_COUNTRY_CODES = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS',
  'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
  'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE',
  'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF',
  'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM',
  'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM',
  'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC',
  'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK',
  'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA',
  'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG',
  'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS',
  'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO',
  'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
  'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
];

const betterNames: Record<string, string> = {
  GB: 'United Kingdom',
  US: 'United States',
  RU: 'Russia',
  KR: 'South Korea',
  TW: 'Taiwan',
};

function nameFromCode(code: string): string {
  return betterNames[code] ?? countryCodes.getCountry(code);
}

interface CountrySelectorModalProps {
  visible: boolean;
  onClose: () => void;
  currentCountry: string | null;
  onSelect: (code: string) => void;
  secret: string;
}

export default function CountrySelectorModal({
  visible,
  onClose,
  currentCountry,
  onSelect,
  secret,
}: CountrySelectorModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredCountries = useMemo(() => {
    if (!searchQuery) return VALID_COUNTRY_CODES;
    const query = searchQuery.toLowerCase();
    return VALID_COUNTRY_CODES.filter((code) => {
      const name = nameFromCode(code);
      return name.toLowerCase().includes(query) || code.toLowerCase().includes(query);
    });
  }, [searchQuery]);

  const handleSelect = async (code: string) => {
    setSaving(true);
    try {
      const result = await api.updateCountryCode(secret, code);
      if (result.success) {
        onSelect(code);
        onClose();
      } else {
        Alert.alert('Error', 'Failed to update country');
      }
    } catch (error) {
      console.error('Failed to update country:', error);
      Alert.alert('Error', 'An error occurred while updating your flag');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = () => handleSelect('');

  const renderItem = ({ item }: { item: string }) => {
    const isSelected = currentCountry === item;
    return (
      <Pressable
        style={[styles.countryItem, isSelected && styles.countryItemSelected]}
        onPress={() => handleSelect(item)}
        disabled={saving}
      >
        <Image
          source={{ uri: `https://flagcdn.com/w80/${item.toLowerCase()}.png` }}
          style={styles.flagImage}
        />
        <Text style={styles.countryName} numberOfLines={1}>{nameFromCode(item)}</Text>
        {isSelected && (
          <View style={styles.checkmark}>
            <Text style={{ color: '#4CAF50', fontSize: 16 }}>✓</Text>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.card}>
          <Text style={styles.title}>Select Your Country Flag</Text>

          <TextInput
            style={styles.searchInput}
            placeholder="Search country..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <FlatList
            data={filteredCountries}
            renderItem={renderItem}
            keyExtractor={(item) => item}
            style={styles.list}
            numColumns={2}
            columnWrapperStyle={{ gap: 8 }}
            contentContainerStyle={{ gap: 8 }}
            showsVerticalScrollIndicator={false}
          />

          <View style={styles.buttonRow}>
            {currentCountry && (
              <Pressable
                style={[styles.removeButton, saving && { opacity: 0.5 }]}
                onPress={handleRemove}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.removeButtonText}>Remove Flag</Text>
                )}
              </Pressable>
            )}
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: 'rgba(36, 87, 52, 0.95)',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontFamily: 'Lexend-SemiBold',
    textAlign: 'center',
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: 12,
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Lexend',
    marginBottom: 12,
  },
  list: {
    flexGrow: 0,
    marginBottom: 16,
  },
  countryItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  countryItemSelected: {
    backgroundColor: 'rgba(76, 175, 80, 0.3)',
    borderColor: '#4CAF50',
    borderWidth: 2,
  },
  flagImage: {
    width: 28,
    height: 19,
    borderRadius: 2,
  },
  countryName: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Lexend',
  },
  checkmark: {
    width: 20,
    alignItems: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  removeButton: {
    backgroundColor: 'rgba(244, 67, 54, 0.8)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  removeButtonText: {
    color: '#fff',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 14,
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  cancelButtonText: {
    color: '#fff',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 14,
  },
});
