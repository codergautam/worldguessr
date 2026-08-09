import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Alert,
  TextInput,
  Modal,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Pressable } from '../ui/SfxPressable';
import Ionicons from '@expo/vector-icons/Ionicons';
import { t, validateUsername, USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH } from '../../shared';
import { api } from '../../services/api';
import {
  GlassCard,
  ProgressionGraph,
  msToTime,
  sharedStyles,
  ProgressionEntry,
} from './shared';
import CountryFlag from '../CountryFlag';

interface ProfileTabProps {
  profileData: {
    username?: string;
    totalXp?: number;
    createdAt?: string;
    gamesLen?: number;
    gamesPlayed?: number;
    profileViews?: number;
    canChangeUsername?: boolean;
    daysUntilNameChange?: number;
    recentChange?: boolean;
    countryCode?: string;
    pendingNameChange?: boolean;
    pendingNameChangePublicNote?: string;
    /**
     * Career high on the RETIRED Season 0 scale (0-20,000). Not comparable to
     * the Season 1 rating shown on the ELO tab, which tops out around 1,600.
     * Optional and frequently absent: accounts created after the migration have
     * no Season 0 and the field stays null.
     */
    seasonPeakElo?: number | null;
    /** Tier name at that Season 0 peak, e.g. "Nomad". */
    seasonPeakLeague?: string | null;
    /**
     * CLOSING rating on the old scale (`elo_s0`), shown in the OG badge's card.
     * A different and usually smaller number than seasonPeakElo. Every row of
     * that card renders independently, so a payload missing one field drops that
     * row rather than the card.
     */
    season0Elo?: number | null;
    /**
     * Closing PLACE on the Season 0 ladder, from the frozen rank table the
     * server owns (shared/season0/rankTable.js). Null until that table has been
     * exported, and null for accounts the Hall of Fame excludes. Never derived
     * from the live rank — that ranks a different ladder.
     */
    season0Rank?: number | null;
    /**
     * The OG badge. Resolved SERVER-SIDE (api/publicProfile.js, from
     * shared/season0/rank.js) and true for every account that was here for
     * Season 0, not just the ones the compensation script stamped. Only ever
     * `true` grants it; the widening happens on the server so this screen and
     * the web profile cannot drift apart over who counts as a veteran.
     */
    ogAccount?: boolean;
  } | null;
  isOwnProfile: boolean;
  secret?: string;
  onLogout?: () => void;
  onChangeFlag?: () => void;
  onUsernameChanged?: () => void;
  progression: ProgressionEntry[];
  progressionLoading: boolean;
  onScrollEnable?: (enabled: boolean) => void;
  viewingPublicProfile?: boolean;
}

interface ExistingRequest {
  requestedUsername: string;
  status: 'pending' | 'rejected';
  rejectionReason?: string;
  rejectionCount?: number;
  createdAt: string;
}

export default function ProfileTab({
  profileData,
  isOwnProfile,
  secret,
  onLogout,
  onChangeFlag,
  onUsernameChanged,
  progression,
  progressionLoading,
  onScrollEnable,
  viewingPublicProfile,
}: ProfileTabProps) {
  const [changingName, setChangingName] = useState(false);
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [existingRequest, setExistingRequest] = useState<ExistingRequest | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  // The OG badge's card. Closed by default — it is the phone's stand-in for the
  // web hover, not a permanent block of stats.
  const [ogCardOpen, setOgCardOpen] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  if (!profileData) return null;

  const joinedAgo = profileData.createdAt
    ? msToTime(Date.now() - new Date(profileData.createdAt).getTime())
    : null;

  const gamesCount = profileData.gamesLen ?? profileData.gamesPlayed ?? 0;

  // ── THE OG BADGE.
  //
  // ONE CHIP, and everything else on the card under it. A second chip used to
  // print the career peak as a big gold number while the card three rows down
  // already said "Peak rating" — one fact in two places on one screen. The chip
  // went; put anything new in a card row. Mirrors components/publicProfile.js on
  // web — keep the two in step.
  //
  // THE LABELLING IS THE FEATURE. `seasonPeakElo` is on the retired 0-20,000
  // scale; the live rating one tab away is on the 100-1,600 one. A player who
  // reads the big dead number as their current rating concludes we took 18,400
  // points off them. Inside the card the row labels plus the closing note carry
  // that, and there is no tooltip on a phone to fall back on, so no Season 0
  // number is ever rendered here without words around it.
  //
  // `> 0`, not `!= null`: post-migration signups have null here and a 0 would
  // render a "Peak rating: 0" row, which is a lie. Nothing is EVER derived from
  // the current rating.
  const peakRaw = Number(profileData.seasonPeakElo);
  const hasSeasonPeak = Number.isFinite(peakRaw) && peakRaw > 0;
  const seasonPeakLeague =
    typeof profileData.seasonPeakLeague === 'string' && profileData.seasonPeakLeague.trim()
      ? profileData.seasonPeakLeague
      : null;
  // Strict `=== true`, and the server decides who gets it — see the prop docs.
  const isOg = profileData.ogAccount === true;
  // Season 0 CLOSING rating. Same `> 0` test as the peak and the same reason: a
  // "Final rating: 0" row would be a lie rather than an absence.
  const finalRaw = Number(profileData.season0Elo);
  const hasSeason0Final = Number.isFinite(finalRaw) && finalRaw > 0;
  // Closing place on that ladder. Same test, same reason.
  const rankRaw = Number(profileData.season0Rank);
  const hasSeason0Rank = Number.isFinite(rankRaw) && rankRaw > 0;
  // Month + year only. The join date on an OG profile is a badge of tenure, not
  // a record, and the exact day is nobody's business.
  const joinedDate = profileData.createdAt ? new Date(profileData.createdAt) : null;
  const joinedMonth =
    joinedDate && !Number.isNaN(joinedDate.getTime())
      ? joinedDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
      : null;

  const handleChangeName = async () => {
    if (!secret) return;
    setNewUsername('');
    setModalError(null);
    setSubmitSuccess(false);
    setExistingRequest(null);
    setNameModalVisible(true);

    // For forced name changes, check existing request status
    if (profileData.pendingNameChange) {
      setCheckingStatus(true);
      try {
        const status = await api.checkNameChangeStatus(secret);
        if (status.request) {
          setExistingRequest(status.request as ExistingRequest);
        }
      } catch {
        // Silently fail — user can still submit
      } finally {
        setCheckingStatus(false);
      }
    }
  };

  const submitNameChange = async () => {
    if (!secret || !newUsername.trim()) return;

    const trimmed = newUsername.trim();
    const validationError = validateUsername(trimmed);
    if (validationError) {
      setModalError(validationError);
      return;
    }

    setModalLoading(true);
    setModalError(null);

    try {
      const response = await api.setName(secret, trimmed);
      if (response.message) {
        setModalError(response.message);
      } else if (response.pendingReview) {
        // Forced name change — submitted for review
        setSubmitSuccess(true);
        setExistingRequest({ requestedUsername: trimmed, status: 'pending', createdAt: new Date().toISOString() });
      } else {
        // Normal name change — immediate success
        setNameModalVisible(false);
        Alert.alert(t('success'), t('nameChanged'));
        onUsernameChanged?.();
      }
    } catch {
      setModalError(t('errorOccurredTryAgain'));
    } finally {
      setModalLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      t('logOut'),
      t('logoutConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('logOut'),
          style: 'destructive',
          onPress: () => onLogout?.(),
        },
      ]
    );
  };

  return (
    <View style={{ gap: 20 }}>
      {/* Stats Card */}
      <GlassCard>
        {joinedAgo && (
          <View style={sharedStyles.statRow}>
            <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.8)" style={sharedStyles.statIcon} />
            <Text style={sharedStyles.statText}>{t('joined', { t: joinedAgo })}</Text>
          </View>
        )}

        <View style={sharedStyles.statRow}>
          <Ionicons name="star" size={16} color="#ffd700" style={sharedStyles.statIcon} />
          <Text style={sharedStyles.statText}>{(profileData.totalXp || 0).toLocaleString()} {t('xp')}</Text>
        </View>

        <View style={sharedStyles.statRow}>
          <Ionicons name="game-controller" size={16} color="rgba(255,255,255,0.8)" style={sharedStyles.statIcon} />
          <Text style={sharedStyles.statText}>{t('gamesPlayedLabel', { count: gamesCount.toLocaleString() })}</Text>
        </View>

        {viewingPublicProfile && profileData.profileViews != null && (
          <View style={sharedStyles.statRow}>
            <Ionicons name="people" size={16} color="rgba(255,255,255,0.8)" style={sharedStyles.statIcon} />
            <Text style={sharedStyles.statText}>{t('profileViewsLabel', { count: profileData.profileViews.toLocaleString() })}</Text>
          </View>
        )}

        {/* The trophy chip, below the live statRows and visually apart from
            them: the statRows are all current-season numbers, and dropping a
            dead-scale 20,000 into that list is exactly the confusion this is
            built to prevent. */}
        {isOg && (
          <View style={styles.badgeRow}>
            {/* There is no hover on a phone, so the web's hover card becomes a
                tap toggle. Same content, same order — see .s1-ogCard in
                styles/season1Badges.css. */}
            <Pressable
              style={[styles.badge, styles.badgeOg, ogCardOpen && styles.badgeOgOpen]}
              onPress={() => setOgCardOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: ogCardOpen }}
            >
              <Text style={styles.badgeIcon}>⭐</Text>
              <View style={styles.badgeBody}>
                <Text style={styles.badgeOgTag}>OG</Text>
                <Text style={styles.badgeLabel}>
                  {t('ogBadgeLabel').toUpperCase()}
                </Text>
              </View>
              <Ionicons
                name={ogCardOpen ? 'chevron-up' : 'chevron-down'}
                size={13}
                color="rgba(255, 215, 0, 0.7)"
              />
            </Pressable>
          </View>
        )}

        {isOg && ogCardOpen && (
          // NO TITLE, same as web: the gold "SEASON 0" eyebrow came out of both
          // cards together. The chip above already says OG / WorldGuessr
          // veteran and the note below says when that was.
          <View style={styles.ogCard}>
            {joinedMonth && (
              <View style={styles.ogCardRow}>
                <Text style={styles.ogCardRowLabel}>{t('ogCardJoined')}</Text>
                <Text style={styles.ogCardRowValue}>{joinedMonth}</Text>
              </View>
            )}
            {hasSeason0Final && (
              <View style={styles.ogCardRow}>
                <Text style={styles.ogCardRowLabel}>
                  {t('ogCardFinal')}
                </Text>
                <Text style={styles.ogCardRowValue}>{Math.round(finalRaw).toLocaleString()}</Text>
              </View>
            )}
            {/* Where that rating finished on the closing ladder. The "#" is what
                makes it read as a place rather than yet another rating on a
                scale nobody remembers. */}
            {hasSeason0Rank && (
              <View style={styles.ogCardRow}>
                <Text style={styles.ogCardRowLabel}>{t('ogCardRank')}</Text>
                <Text style={styles.ogCardRowValue}>#{Math.round(rankRaw).toLocaleString()}</Text>
              </View>
            )}
            {hasSeasonPeak && (
              <View style={styles.ogCardRow}>
                <Text style={styles.ogCardRowLabel}>{t('ogCardPeak')}</Text>
                <Text style={styles.ogCardRowValue}>{Math.round(peakRaw).toLocaleString()}</Text>
              </View>
            )}
            {seasonPeakLeague && (
              <View style={styles.ogCardRow}>
                <Text style={styles.ogCardRowLabel}>
                  {t('ogCardPeakLeague')}
                </Text>
                <Text style={styles.ogCardRowValue}>{seasonPeakLeague}</Text>
              </View>
            )}
            {/* WHAT THE BADGE MEANS, in one line: the account predates the
                ranked update. NOT "played before ranked history was saved",
                which is what this used to say and which stopped being true the
                day the badge widened — most OG accounts never played a ranked
                game. Tenure is the claim, and the Joined row above is the
                evidence. */}
            <Text style={styles.ogCardNote}>
              {t('ogBadgeNote')}
            </Text>
          </View>
        )}

        {/* Own profile action buttons */}
        {isOwnProfile && (
          <View style={{ gap: 12, marginTop: 10 }}>
            {/* Forced Name Change Warning */}
            {profileData.pendingNameChange && (
              <Pressable
                style={({ pressed }) => [
                  styles.orangeButton,
                  pressed && { opacity: 0.8 },
                  changingName && { opacity: 0.6 },
                ]}
                onPress={handleChangeName}
                disabled={changingName}
              >
                {changingName ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="warning" size={18} color="#fff" />
                    <Text style={sharedStyles.actionButtonText}>{t('changeNameRequired')}</Text>
                  </View>
                )}
              </Pressable>
            )}

            {/* Normal Change Name Button */}
            {!profileData.pendingNameChange && profileData.canChangeUsername && (
              <Pressable
                style={({ pressed }) => [
                  styles.greenButton,
                  pressed && { opacity: 0.8 },
                  changingName && { opacity: 0.6 },
                ]}
                onPress={handleChangeName}
                disabled={changingName}
              >
                {changingName ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={sharedStyles.actionButtonText}>{t('changeName')}</Text>
                )}
              </Pressable>
            )}

            {/* Recent change warning */}
            {!profileData.pendingNameChange && profileData.recentChange && (
              <View style={styles.warningCard}>
                <Text style={styles.warningText}>
                  {t('recentChange')}
                </Text>
              </View>
            )}

            {/* Name change cooldown warning */}
            {!profileData.pendingNameChange && !profileData.canChangeUsername && profileData.daysUntilNameChange != null && profileData.daysUntilNameChange > 0 && (
              <View style={styles.warningCard}>
                <Text style={styles.warningText}>
                  {t('nameChangeCooldown', { days: profileData.daysUntilNameChange })}
                </Text>
              </View>
            )}

            {/* Change Country Flag Button */}
            <Pressable
              style={({ pressed }) => [
                styles.blueButton,
                pressed && { opacity: 0.8 },
              ]}
              onPress={onChangeFlag}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {profileData.countryCode && (
                  <CountryFlag countryCode={profileData.countryCode} size={20} />
                )}
                <Text style={sharedStyles.actionButtonText}>
                  {t(profileData.countryCode ? 'changeFlag' : 'setFlag')}
                </Text>
              </View>
            </Pressable>
          </View>
        )}
      </GlassCard>

      {/* XP Progression Graph */}
      <ProgressionGraph
        data={progression}
        loading={progressionLoading}
        mode="xp"
        onChartTouch={onScrollEnable}
      />

      {/* Logout Button (own profile only) */}
      {isOwnProfile && (
        <Pressable
          style={({ pressed }) => [
            styles.logoutButton,
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleLogout}
        >
          <Text style={[sharedStyles.actionButtonText, { color: '#dc3545' }]}>{t('logOut')}</Text>
        </Pressable>
      )}

      {/* Name Change Modal */}
      <Modal
        visible={nameModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setNameModalVisible(false)}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            {/* Close button */}
            <Pressable
              style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.6 }]}
              onPress={() => setNameModalVisible(false)}
            >
              <Text style={styles.modalCloseBtnText}>×</Text>
            </Pressable>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {t(profileData.pendingNameChange ? 'usernameChangeRequired' : 'changeName')}
              </Text>

              {/* Forced change description */}
              {profileData.pendingNameChange && (
                <Text style={styles.modalSubtext}>
                  {t('usernameFlaggedMobileExplanation')}
                </Text>
              )}

              {/* Public note from moderator */}
              {profileData.pendingNameChange && profileData.pendingNameChangePublicNote && (
                <View style={styles.reasonBox}>
                  <Text style={styles.reasonText}>
                    {t('reason')}: {profileData.pendingNameChangePublicNote}
                  </Text>
                </View>
              )}

              {/* Loading status check */}
              {checkingStatus && (
                <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <ActivityIndicator color="#fff" size="small" />
                </View>
              )}

              {/* Pending review state */}
              {!checkingStatus && existingRequest?.status === 'pending' && (
                <View style={styles.pendingBox}>
                  <Text style={styles.pendingTitle}>{t('awaitingApproval')}</Text>
                  <Text style={styles.pendingText}>
                    {t('nameChangeUnderReview', { name: existingRequest.requestedUsername })}
                  </Text>
                  <Text style={styles.pendingNote}>
                    {t('nameChangeApprovalEta')}
                  </Text>
                  <View style={styles.divider}>
                    <Text style={styles.dividerText}>{t('orSubmitDifferentName')}</Text>
                  </View>
                </View>
              )}

              {/* Rejected state */}
              {!checkingStatus && existingRequest?.status === 'rejected' && (
                <View style={styles.rejectedBox}>
                  <Text style={styles.rejectedTitle}>{t('nameRejected')}</Text>
                  <Text style={styles.rejectedText}>
                    {t('nameChangeRejectedBody', { name: existingRequest.requestedUsername })}
                  </Text>
                  {existingRequest.rejectionReason && (
                    <Text style={styles.rejectedReason}>
                      {t('reason')}: {existingRequest.rejectionReason}
                    </Text>
                  )}
                  <Text style={styles.pendingNote}>
                    {t('chooseDifferentUsername')}
                  </Text>
                </View>
              )}

              {/* Success after fresh submission */}
              {submitSuccess && !existingRequest?.status ? (
                <View style={styles.successBox}>
                  <Text style={styles.successTitle}>{t('requestSubmitted')}</Text>
                  <Text style={styles.successText}>
                    {t('nameChangeSubmittedForReview')}
                  </Text>
                </View>
              ) : (
                <>
                  {/* Input */}
                  <TextInput
                    style={styles.modalInput}
                    placeholder={t('enterNewName')}
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    value={newUsername}
                    onChangeText={(text) => {
                      setNewUsername(text);
                      setModalError(null);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    maxLength={USERNAME_MAX_LENGTH}
                    editable={!modalLoading}
                  />
                  <Text style={styles.hintText}>
                    {t('usernameRulesHint', { min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH })}
                  </Text>

                  {/* Error */}
                  {modalError && (
                    <View style={styles.errorBox}>
                      <Text style={styles.errorText}>{modalError}</Text>
                    </View>
                  )}

                  {/* Buttons */}
                  <View style={styles.modalButtons}>
                    {!profileData.pendingNameChange && (
                      <Pressable
                        style={[styles.modalButton, styles.modalButtonCancel]}
                        onPress={() => setNameModalVisible(false)}
                        disabled={modalLoading}
                      >
                        <Text style={styles.modalButtonText}>{t('cancel')}</Text>
                      </Pressable>
                    )}
                    <Pressable
                      style={[styles.modalButton, styles.modalButtonConfirm, (!newUsername.trim() || modalLoading) && { opacity: 0.5 }]}
                      onPress={submitNameChange}
                      disabled={!newUsername.trim() || modalLoading}
                    >
                      {modalLoading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.modalButtonText}>
                          {profileData.pendingNameChange ? t('submit') : t('change')}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </>
              )}

              {/* Contact support */}
              {profileData.pendingNameChange && (
                <Text style={styles.contactText}>
                  {t('needHelpContactSupport')}
                </Text>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // The OG chip. Mirrors .s1-badge in styles/season1Badges.css — keep the two in
  // step. A gold-outlined dark glass pill, never a full-bleed card: a stacked
  // bar of migration prose is what it replaced. badgeRow stays a wrapping row
  // even with one chip in it, which is where a second badge would go.
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 7,
    paddingLeft: 11,
    paddingRight: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
  },
  badgeOg: {
    borderColor: 'rgba(255, 215, 0, 0.4)',
    backgroundColor: 'rgba(255, 215, 0, 0.07)',
  },
  badgeOgOpen: {
    borderColor: 'rgba(255, 215, 0, 0.8)',
  },
  // OG card. Mirrors .s1-ogCard on web, but anchored inline under the chip row
  // instead of floating: a popover over a scrolling list is a fight nobody wins
  // on a phone.
  ogCard: {
    marginTop: 8,
    gap: 5,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    backgroundColor: 'rgba(8, 10, 9, 0.96)',
  },
  ogCardRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 16,
  },
  ogCardRowLabel: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 13,
    fontFamily: 'Lexend-Regular',
  },
  ogCardRowValue: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 13,
    fontFamily: 'Lexend-SemiBold',
    // Final and peak are read as a pair down the right edge.
    fontVariant: ['tabular-nums'],
  },
  ogCardNote: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Lexend-Regular',
  },
  badgeIcon: {
    fontSize: 18,
    lineHeight: 22,
  },
  badgeBody: {
    gap: 1,
  },
  // The caption under "OG". The chip's own word is two letters, and this is the
  // only thing on the closed badge that says what those two letters mean.
  badgeLabel: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: 'Lexend-Medium',
  },
  // "OG" is the badge itself, not a tag stuck to a sentence, so it carries the
  // weight a headline number would.
  badgeOgTag: {
    color: '#ffd700',
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: 2,
    fontFamily: 'Lexend-SemiBold',
  },
  greenButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: '#28a745',
    alignItems: 'center',
    shadowColor: '#28a745',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 3,
  },
  orangeButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: '#e67e22',
    alignItems: 'center',
    shadowColor: '#e67e22',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 3,
  },
  blueButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 3,
  },
  logoutButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: 'rgba(220, 53, 69, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(220, 53, 69, 0.3)',
    alignItems: 'center',
  },
  warningCard: {
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 193, 7, 0.3)',
  },
  warningText: {
    color: '#ffc107',
    fontSize: 13,
    fontFamily: 'Lexend',
    textAlign: 'center',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  modalCloseBtnText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 22,
  },
  modalCard: {
    backgroundColor: 'rgba(36, 87, 52, 0.95)',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontFamily: 'Lexend-SemiBold',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtext: {
    color: '#ffc107',
    fontSize: 14,
    fontFamily: 'Lexend',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 20,
  },
  reasonBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  reasonText: {
    color: '#e0e0e0',
    fontSize: 13,
    fontFamily: 'Lexend',
  },
  pendingBox: {
    backgroundColor: 'rgba(210, 153, 34, 0.15)',
    borderWidth: 1,
    borderColor: '#d29922',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  pendingTitle: {
    color: '#d29922',
    fontSize: 16,
    fontFamily: 'Lexend-SemiBold',
    marginBottom: 6,
  },
  pendingText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Lexend',
    marginBottom: 6,
  },
  pendingNote: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontFamily: 'Lexend',
  },
  divider: {
    alignItems: 'center',
    marginTop: 14,
  },
  dividerText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontFamily: 'Lexend',
  },
  rejectedBox: {
    backgroundColor: 'rgba(248, 81, 73, 0.15)',
    borderWidth: 1,
    borderColor: '#f85149',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  rejectedTitle: {
    color: '#f85149',
    fontSize: 16,
    fontFamily: 'Lexend-SemiBold',
    marginBottom: 6,
  },
  rejectedText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Lexend',
    marginBottom: 6,
  },
  rejectedReason: {
    color: '#f85149',
    fontSize: 13,
    fontFamily: 'Lexend',
    fontStyle: 'italic',
    marginBottom: 6,
  },
  successBox: {
    backgroundColor: 'rgba(63, 185, 80, 0.15)',
    borderWidth: 1,
    borderColor: '#3fb950',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  successTitle: {
    color: '#3fb950',
    fontSize: 16,
    fontFamily: 'Lexend-SemiBold',
    marginBottom: 6,
  },
  successText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Lexend',
  },
  modalInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Lexend',
    marginBottom: 4,
    marginTop: 8,
  },
  hintText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontFamily: 'Lexend',
    marginBottom: 12,
    marginLeft: 4,
  },
  errorBox: {
    backgroundColor: 'rgba(248, 81, 73, 0.15)',
    borderWidth: 1,
    borderColor: '#f85149',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    color: '#f85149',
    fontSize: 13,
    fontFamily: 'Lexend',
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modalButtonConfirm: {
    backgroundColor: '#28a745',
  },
  modalButtonText: {
    color: '#fff',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 15,
  },
  contactText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontFamily: 'Lexend',
    textAlign: 'center',
    marginTop: 16,
  },
});
