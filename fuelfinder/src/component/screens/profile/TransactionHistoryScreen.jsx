import React from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { useLanguage } from "../../context/LanguageContext";
import { getMyTransactionHistory } from "../../services/queueService";

const TRANSACTION_HISTORY_LIMIT = 200;
const ETHIOPIAN_TIMEZONE = "Africa/Addis_Ababa";
const ETHIOPIAN_MONTHS = [
  "Meskerem",
  "Tikimt",
  "Hidar",
  "Tahsas",
  "Tir",
  "Yekatit",
  "Megabit",
  "Miazia",
  "Ginbot",
  "Sene",
  "Hamle",
  "Nehase",
  "Pagume",
];

function formatTransactionMoney(value, currency = "ETB") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  const normalizedCurrency = String(currency || "ETB").trim().toUpperCase() || "ETB";
  return `${amount.toFixed(2)} ${normalizedCurrency}`;
}

function formatTransactionLabel(value, fallback = "-") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function getTransactionTone(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["authorized", "refunded", "served", "verified", "success", "not_required"].includes(normalized)) {
    return "success";
  }
  if (["pending", "pending_payment", "waiting", "called", "arrived", "initialized"].includes(normalized)) {
    return "warning";
  }
  if (["failed", "cancelled", "expired", "forfeited", "rejected"].includes(normalized)) {
    return "danger";
  }
  return "neutral";
}

function getTransactionFuelLabel(t, fuelType) {
  const normalized = String(fuelType || "").trim().toLowerCase();
  if (normalized === "diesel") return t("fuelDiesel");
  if (normalized === "other") return t("fuelOther", { defaultValue: "Other" });
  return t("fuelGasoline");
}

function getTransactionActivityDate(item) {
  return item?.depositPaidAt || item?.servedAt || item?.createdAt || item?.updatedAt || item?.joinedAt;
}

function isGregorianLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function getGregorianPartsInTimeZone(value, timeZone = ETHIOPIAN_TIMEZONE) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(date);
    const year = Number(parts.find((item) => item.type === "year")?.value || 0);
    const month = Number(parts.find((item) => item.type === "month")?.value || 0);
    const day = Number(parts.find((item) => item.type === "day")?.value || 0);
    if (year > 0 && month > 0 && day > 0) {
      return { year, month, day };
    }
  } catch (_error) {
    // Fall back to UTC parsing when Intl time-zone formatting is unavailable.
  }

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function getEthiopianNewYearDay(gregorianYear) {
  return isGregorianLeapYear(gregorianYear + 1) ? 12 : 11;
}

function getEthiopianDateParts(value) {
  const gregorian = getGregorianPartsInTimeZone(value);
  if (!gregorian) return null;

  const currentDate = Date.UTC(gregorian.year, gregorian.month - 1, gregorian.day);
  let ethiopianYear = gregorian.year - 7;
  let ethiopianNewYear = Date.UTC(gregorian.year, 8, getEthiopianNewYearDay(gregorian.year));

  if (currentDate < ethiopianNewYear) {
    ethiopianYear -= 1;
    const previousGregorianYear = gregorian.year - 1;
    ethiopianNewYear = Date.UTC(
      previousGregorianYear,
      8,
      getEthiopianNewYearDay(previousGregorianYear)
    );
  }

  const diffDays = Math.floor((currentDate - ethiopianNewYear) / (24 * 60 * 60 * 1000));
  return {
    year: ethiopianYear,
    month: Math.floor(diffDays / 30) + 1,
    day: (diffDays % 30) + 1,
  };
}

function formatEthiopianDateParts(parts) {
  if (!parts?.year || !parts?.month || !parts?.day) return "";
  const monthName = ETHIOPIAN_MONTHS[parts.month - 1] || `Month ${parts.month}`;
  return `${monthName} ${parts.day}, ${parts.year}`;
}

function formatEthiopianTransactionDate(value) {
  const parts = getEthiopianDateParts(value);
  if (!parts) return "";

  let timeLabel = "";
  try {
    timeLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: ETHIOPIAN_TIMEZONE,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch (_error) {
    timeLabel = "";
  }

  return `${formatEthiopianDateParts(parts)}${timeLabel ? `, ${timeLabel}` : ""}`;
}

function isEthiopianLeapYear(year) {
  return Number(year) % 4 === 3;
}

function getEthiopianMonthDayCount(year, month) {
  if (month === 13) return isEthiopianLeapYear(year) ? 6 : 5;
  return 30;
}

function compareEthiopianDateParts(left, right) {
  if (!left || !right) return 0;
  if (left.year !== right.year) return left.year - right.year;
  if (left.month !== right.month) return left.month - right.month;
  return left.day - right.day;
}

function buildPickerDraft(parts) {
  const current = parts || getEthiopianDateParts(new Date()) || { year: 2018, month: 1, day: 1 };
  return {
    yearText: String(current.year || 2018),
    month: Number(current.month || 1),
    day: Number(current.day || 1),
  };
}

function normalizePickerDraft(draft) {
  const rawYear = String(draft?.yearText || "").trim();
  if (!rawYear) return null;
  const year = Math.trunc(Number(rawYear));
  if (!Number.isFinite(year) || year <= 0) return null;
  const month = Math.min(13, Math.max(1, Math.trunc(Number(draft?.month || 1))));
  const maxDay = getEthiopianMonthDayCount(year, month);
  const day = Math.min(maxDay, Math.max(1, Math.trunc(Number(draft?.day || 1))));
  return { year, month, day };
}

function getBadgeStyles(styles, tone) {
  if (tone === "success") {
    return {
      badge: styles.transactionBadgeSuccess,
      text: styles.transactionBadgeTextSuccess,
    };
  }
  if (tone === "warning") {
    return {
      badge: styles.transactionBadgeWarning,
      text: styles.transactionBadgeTextWarning,
    };
  }
  if (tone === "danger") {
    return {
      badge: styles.transactionBadgeDanger,
      text: styles.transactionBadgeTextDanger,
    };
  }
  return {
    badge: styles.transactionBadgeNeutral,
    text: styles.transactionBadgeTextNeutral,
  };
}

export default function TransactionHistoryScreen() {
  const { t } = useLanguage();
  const [transactionHistory, setTransactionHistory] = React.useState([]);
  const [transactionHistoryTotal, setTransactionHistoryTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [fromDate, setFromDate] = React.useState(null);
  const [toDate, setToDate] = React.useState(null);
  const [pickerTarget, setPickerTarget] = React.useState("");
  const [pickerDraft, setPickerDraft] = React.useState(() => buildPickerDraft(null));
  const hasLoadedRef = React.useRef(false);

  const loadTransactionHistory = React.useCallback(
    async (isRefreshing = false) => {
      if (isRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const data = await getMyTransactionHistory(TRANSACTION_HISTORY_LIMIT);
        setTransactionHistory(Array.isArray(data?.items) ? data.items : []);
        setTransactionHistoryTotal(Number(data?.total || 0));
      } catch (_error) {
        Alert.alert(t("somethingWentWrong"));
      } finally {
        if (isRefreshing) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [t]
  );

  useFocusEffect(
    React.useCallback(() => {
      void loadTransactionHistory(hasLoadedRef.current);
      hasLoadedRef.current = true;
      return undefined;
    }, [loadTransactionHistory])
  );

  const filteredTransactions = React.useMemo(() => {
    return transactionHistory.filter((item) => {
      const activityDate = getTransactionActivityDate(item);
      const ethiopianDate = getEthiopianDateParts(activityDate);
      if (!ethiopianDate) {
        return !fromDate && !toDate;
      }
      if (fromDate && compareEthiopianDateParts(ethiopianDate, fromDate) < 0) {
        return false;
      }
      if (toDate && compareEthiopianDateParts(ethiopianDate, toDate) > 0) {
        return false;
      }
      return true;
    });
  }, [fromDate, toDate, transactionHistory]);

  const pickerYear = Math.max(1, Math.trunc(Number(pickerDraft.yearText || 0)) || 2018);
  const pickerMonth = Math.min(13, Math.max(1, Number(pickerDraft.month || 1)));
  const pickerMaxDay = getEthiopianMonthDayCount(pickerYear, pickerMonth);
  const pickerDays = React.useMemo(
    () => Array.from({ length: pickerMaxDay }, (_, index) => index + 1),
    [pickerMaxDay]
  );

  React.useEffect(() => {
    setPickerDraft((current) => {
      if (!current?.day || current.day <= pickerMaxDay) return current;
      return { ...current, day: pickerMaxDay };
    });
  }, [pickerMaxDay]);

  const hasDateFilters = Boolean(fromDate || toDate);

  const openPicker = React.useCallback(
    (target) => {
      const seed = target === "from" ? fromDate : toDate;
      setPickerTarget(target);
      setPickerDraft(buildPickerDraft(seed));
    },
    [fromDate, toDate]
  );

  const closePicker = React.useCallback(() => {
    setPickerTarget("");
  }, []);

  const applyDateSelection = React.useCallback(() => {
    const normalized = normalizePickerDraft(pickerDraft);
    if (!normalized) {
      Alert.alert(
        t("invalidDateTitle", { defaultValue: "Invalid date" }),
        t("invalidDateBody", { defaultValue: "Please enter a valid Ethiopian date." })
      );
      return;
    }

    if (pickerTarget === "from") {
      if (toDate && compareEthiopianDateParts(normalized, toDate) > 0) {
        setFromDate(toDate);
        setToDate(normalized);
      } else {
        setFromDate(normalized);
      }
    } else if (pickerTarget === "to") {
      if (fromDate && compareEthiopianDateParts(fromDate, normalized) > 0) {
        setFromDate(normalized);
        setToDate(fromDate);
      } else {
        setToDate(normalized);
      }
    }

    setPickerTarget("");
  }, [fromDate, pickerDraft, pickerTarget, t, toDate]);

  const clearDateFilter = React.useCallback((target) => {
    if (target === "from") {
      setFromDate(null);
      return;
    }
    if (target === "to") {
      setToDate(null);
      return;
    }
    setFromDate(null);
    setToDate(null);
  }, []);

  const filterSummary = React.useMemo(() => {
    if (!hasDateFilters) {
      return t("transactionHistoryFilterSummary", {
        defaultValue: `${filteredTransactions.length} records loaded`,
      });
    }

    return t("transactionHistoryFilterResultSummary", {
      defaultValue: `${filteredTransactions.length} matching records`,
    });
  }, [filteredTransactions.length, hasDateFilters, t]);

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>
          {t("transactionHistoryTitle", { defaultValue: "Transaction History" })}
        </Text>

        <View style={styles.headerCard}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>
              {t("transactionHistoryHeading", { defaultValue: "Recent reservations and payments" })}
            </Text>
            <Text style={styles.headerSubtitle}>
              {t("transactionHistoryPageSubtitle", {
                defaultValue:
                  "Open your full transaction log here and filter it with Ethiopian calendar dates.",
              })}
            </Text>
          </View>

          <View style={styles.headerMetaWrap}>
            <Text style={styles.headerCount}>
              {transactionHistoryTotal} {t("transactionHistoryCount", { defaultValue: "records" })}
            </Text>
            <Pressable
              style={[styles.refreshButton, refreshing && styles.refreshButtonDisabled]}
              onPress={() => loadTransactionHistory(true)}
              disabled={refreshing}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.refreshButtonText}>
                  {t("refreshActionLabel", { defaultValue: "Refresh" })}
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.filterCard}>
          <View style={styles.filterHeader}>
            <View style={styles.filterHeaderText}>
              <Text style={styles.filterTitle}>
                {t("transactionHistoryDateFilterTitle", { defaultValue: "Filter by Ethiopian date" })}
              </Text>
              <Text style={styles.filterSubtitle}>
                {t("transactionHistoryDateFilterSubtitle", {
                  defaultValue: "Choose a start date and end date in the Ethiopian calendar.",
                })}
              </Text>
            </View>
            {hasDateFilters ? (
              <Pressable style={styles.clearFilterButton} onPress={() => clearDateFilter("all")}>
                <Text style={styles.clearFilterButtonText}>
                  {t("clearAllActionLabel", { defaultValue: "Clear all" })}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.filterRow}>
            <Pressable style={styles.filterField} onPress={() => openPicker("from")}>
              <Text style={styles.filterLabel}>
                {t("transactionHistoryFromDateLabel", { defaultValue: "From (ET)" })}
              </Text>
              <Text style={styles.filterValue}>
                {fromDate
                  ? formatEthiopianDateParts(fromDate)
                  : t("transactionHistorySelectDate", { defaultValue: "Select date" })}
              </Text>
            </Pressable>

            <Pressable style={styles.filterField} onPress={() => openPicker("to")}>
              <Text style={styles.filterLabel}>
                {t("transactionHistoryToDateLabel", { defaultValue: "To (ET)" })}
              </Text>
              <Text style={styles.filterValue}>
                {toDate
                  ? formatEthiopianDateParts(toDate)
                  : t("transactionHistorySelectDate", { defaultValue: "Select date" })}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.filterResultText}>{filterSummary}</Text>
        </View>

        <View style={styles.listCard}>
          {loading ? (
            <View style={styles.stateWrap}>
              <ActivityIndicator size="small" color="#0F766E" />
              <Text style={styles.stateText}>
                {t("transactionHistoryLoading", { defaultValue: "Loading transaction history..." })}
              </Text>
            </View>
          ) : !filteredTransactions.length ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyStateCard}>
                <Ionicons name="receipt-outline" size={24} color="#0F766E" />
                <Text style={styles.emptyStateTitle}>
                  {hasDateFilters
                    ? t("transactionHistoryFilterEmptyTitle", {
                        defaultValue: "No transactions for this date range",
                      })
                    : t("transactionHistoryEmptyTitle", { defaultValue: "No transactions yet" })}
                </Text>
                <Text style={styles.emptyStateSubtitle}>
                  {hasDateFilters
                    ? t("transactionHistoryFilterEmptyBody", {
                        defaultValue:
                          "Try another Ethiopian date range to find the transactions you need.",
                      })
                    : t("transactionHistoryEmptyBody", {
                        defaultValue:
                          "When you reserve fuel or complete a payment, it will appear here in your history.",
                      })}
                </Text>
              </View>
            </View>
          ) : (
            filteredTransactions.map((item, index) => {
              const queueTone = getTransactionTone(item?.status);
              const paymentTone = getTransactionTone(item?.paymentStatus);
              const queueBadge = getBadgeStyles(styles, queueTone);
              const paymentBadge = getBadgeStyles(styles, paymentTone);
              const activityDate = getTransactionActivityDate(item);

              return (
                <View
                  key={String(item?.id || item?.reservationId || index)}
                  style={[styles.transactionItem, index > 0 && styles.transactionItemBorder]}
                >
                  <View style={styles.transactionItemHeader}>
                    <View style={styles.transactionItemHeaderText}>
                      <Text style={styles.transactionStationName} numberOfLines={1}>
                        {item?.stationName || t("stationDetails.screenTitle", { defaultValue: "Station" })}
                      </Text>
                      <Text style={styles.transactionItemDate}>
                        {formatEthiopianTransactionDate(activityDate) ||
                          t("transactionHistoryDateUnknown", { defaultValue: "Date unavailable" })}
                      </Text>
                    </View>

                    <View style={styles.transactionBadgeWrap}>
                      <View style={[styles.transactionBadge, queueBadge.badge]}>
                        <Text style={[styles.transactionBadgeText, queueBadge.text]}>
                          {formatTransactionLabel(item?.status)}
                        </Text>
                      </View>
                      <View style={[styles.transactionBadge, paymentBadge.badge]}>
                        <Text style={[styles.transactionBadgeText, paymentBadge.text]}>
                          {formatTransactionLabel(item?.paymentStatus)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.transactionMetricRow}>
                    <View style={styles.transactionMetric}>
                      <Text style={styles.transactionMetricLabel}>
                        {t("transactionHistoryFuelLabel", { defaultValue: "Fuel" })}
                      </Text>
                      <Text style={styles.transactionMetricValue}>
                        {getTransactionFuelLabel(t, item?.fuelType)}
                      </Text>
                    </View>
                    <View style={styles.transactionMetric}>
                      <Text style={styles.transactionMetricLabel}>
                        {t("transactionHistoryLitersLabel", { defaultValue: "Liters" })}
                      </Text>
                      <Text style={styles.transactionMetricValue}>
                        {Number(item?.requestedLiters || 0).toFixed(2)} L
                      </Text>
                    </View>
                    <View style={styles.transactionMetric}>
                      <Text style={styles.transactionMetricLabel}>
                        {t("transactionHistoryAmountLabel", { defaultValue: "Amount" })}
                      </Text>
                      <Text style={styles.transactionMetricValue}>
                        {formatTransactionMoney(item?.estimatedAmount, item?.currency)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.transactionMetaLine}>
                    {t("transactionHistoryDepositLabel", { defaultValue: "Deposit" })}:{" "}
                    {formatTransactionMoney(item?.depositAmount, item?.currency)}
                  </Text>
                  {item?.reservationCode ? (
                    <Text style={styles.transactionMetaLine}>
                      {t("transactionHistoryReservationLabel", { defaultValue: "Reservation" })}:{" "}
                      {item.reservationCode}
                    </Text>
                  ) : null}
                  {item?.paymentProvider || item?.paymentReference ? (
                    <Text style={styles.transactionMetaLine}>
                      {t("transactionHistoryPaymentLabel", { defaultValue: "Payment" })}:{" "}
                      {formatTransactionLabel(
                        item?.paymentProvider,
                        t("transactionHistoryPaymentUnknown", { defaultValue: "Not available" })
                      )}
                      {item?.paymentReference ? ` • Ref ${item.paymentReference}` : ""}
                    </Text>
                  ) : null}
                  {item?.checkInStatus && String(item.checkInStatus).trim().toLowerCase() !== "pending" ? (
                    <Text style={styles.transactionMetaLine}>
                      {t("transactionHistoryCheckInLabel", { defaultValue: "Check-in" })}:{" "}
                      {formatTransactionLabel(item.checkInStatus)}
                    </Text>
                  ) : null}
                  {item?.address ? (
                    <Text style={styles.transactionMetaLine} numberOfLines={2}>
                      {item.address}
                    </Text>
                  ) : null}
                </View>
              );
            })
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <Modal visible={Boolean(pickerTarget)} transparent animationType="fade" onRequestClose={closePicker}>
        <View style={styles.pickerOverlay}>
          <Pressable style={styles.pickerOverlayDismiss} onPress={closePicker} />
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>
              {pickerTarget === "from"
                ? t("transactionHistoryFromDateLabel", { defaultValue: "From (ET)" })
                : t("transactionHistoryToDateLabel", { defaultValue: "To (ET)" })}
            </Text>
            <Text style={styles.pickerSubtitle}>
              {t("transactionHistoryPickerSubtitle", {
                defaultValue: "Select an Ethiopian calendar date for filtering your transaction history.",
              })}
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {t("transactionHistoryPickerYear", { defaultValue: "Year" })}
              </Text>
              <TextInput
                value={pickerDraft.yearText}
                onChangeText={(value) =>
                  setPickerDraft((current) => ({
                    ...current,
                    yearText: value.replace(/[^0-9]/g, ""),
                  }))
                }
                style={styles.textInput}
                keyboardType="number-pad"
                placeholder="2018"
                placeholderTextColor="#94A3B8"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {t("transactionHistoryPickerMonth", { defaultValue: "Month" })}
              </Text>
              <View style={styles.pickerChipGrid}>
                {ETHIOPIAN_MONTHS.map((monthName, index) => {
                  const monthNumber = index + 1;
                  const active = pickerMonth === monthNumber;
                  return (
                    <Pressable
                      key={monthName}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() =>
                        setPickerDraft((current) => ({
                          ...current,
                          month: monthNumber,
                        }))
                      }
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {monthName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {t("transactionHistoryPickerDay", { defaultValue: "Day" })}
              </Text>
              <View style={styles.pickerChipGrid}>
                {pickerDays.map((day) => {
                  const active = Number(pickerDraft.day || 1) === day;
                  return (
                    <Pressable
                      key={String(day)}
                      style={[styles.dayChip, active && styles.chipActive]}
                      onPress={() =>
                        setPickerDraft((current) => ({
                          ...current,
                          day,
                        }))
                      }
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{day}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.modalActionRow}>
              <Pressable style={styles.modalSecondaryButton} onPress={closePicker}>
                <Text style={styles.modalSecondaryButtonText}>{t("cancel")}</Text>
              </Pressable>
              <Pressable
                style={styles.modalSecondaryButton}
                onPress={() =>
                  setPickerDraft(buildPickerDraft(getEthiopianDateParts(new Date())))
                }
              >
                <Text style={styles.modalSecondaryButtonText}>
                  {t("todayActionLabel", { defaultValue: "Today" })}
                </Text>
              </Pressable>
            </View>

            <View style={styles.modalActionRow}>
              <Pressable
                style={styles.modalSecondaryButton}
                onPress={() => {
                  clearDateFilter(pickerTarget);
                  closePicker();
                }}
              >
                <Text style={styles.modalSecondaryButtonText}>
                  {t("clearActionLabel", { defaultValue: "Clear" })}
                </Text>
              </Pressable>
              <Pressable style={styles.modalPrimaryButton} onPress={applyDateSelection}>
                <Text style={styles.modalPrimaryButtonText}>
                  {t("applyActionLabel", { defaultValue: "Apply" })}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  content: {
    padding: 16,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 12,
  },
  headerCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    gap: 12,
  },
  headerTextWrap: {
    gap: 6,
  },
  headerTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900",
  },
  headerSubtitle: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  headerMetaWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCount: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
  },
  refreshButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
  },
  refreshButtonDisabled: {
    opacity: 0.7,
  },
  refreshButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  filterCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    gap: 12,
  },
  filterHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  filterHeaderText: {
    flex: 1,
    gap: 4,
  },
  filterTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900",
  },
  filterSubtitle: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  clearFilterButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FEE2E2",
  },
  clearFilterButtonText: {
    color: "#B91C1C",
    fontSize: 12,
    fontWeight: "900",
  },
  filterRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  filterField: {
    flex: 1,
    minWidth: 145,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  filterLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  filterValue: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "800",
  },
  filterResultText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
  },
  listCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 18,
    overflow: "hidden",
  },
  stateWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  stateText: {
    color: "#475569",
    fontWeight: "800",
    fontSize: 13,
  },
  emptyWrap: {
    padding: 12,
  },
  emptyStateCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#CCFBF1",
    backgroundColor: "#F0FDFA",
    padding: 18,
    alignItems: "center",
  },
  emptyStateTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "center",
  },
  emptyStateSubtitle: {
    marginTop: 6,
    color: "#64748B",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    textAlign: "center",
  },
  transactionItem: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  transactionItemBorder: {
    borderTopWidth: 1,
    borderTopColor: "#EEF2F6",
  },
  transactionItemHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  transactionItemHeaderText: {
    flex: 1,
  },
  transactionStationName: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900",
  },
  transactionItemDate: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
  },
  transactionBadgeWrap: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    maxWidth: "48%",
  },
  transactionBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  transactionBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  transactionBadgeNeutral: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
  },
  transactionBadgeTextNeutral: {
    color: "#475569",
  },
  transactionBadgeSuccess: {
    backgroundColor: "#DCFCE7",
    borderColor: "#86EFAC",
  },
  transactionBadgeTextSuccess: {
    color: "#166534",
  },
  transactionBadgeWarning: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FCD34D",
  },
  transactionBadgeTextWarning: {
    color: "#92400E",
  },
  transactionBadgeDanger: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
  },
  transactionBadgeTextDanger: {
    color: "#B91C1C",
  },
  transactionMetricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  transactionMetric: {
    flex: 1,
    minWidth: 95,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  transactionMetricLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
  },
  transactionMetricValue: {
    marginTop: 4,
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "900",
  },
  transactionMetaLine: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    padding: 20,
  },
  pickerOverlayDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  pickerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 12,
  },
  pickerTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900",
  },
  pickerSubtitle: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "800",
  },
  textInput: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    color: "#0F172A",
    fontWeight: "800",
    fontSize: 14,
  },
  pickerChipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#F8FAFC",
  },
  dayChip: {
    minWidth: 44,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#F8FAFC",
  },
  chipActive: {
    borderColor: "#1D4ED8",
    backgroundColor: "#DBEAFE",
  },
  chipText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
  },
  chipTextActive: {
    color: "#1D4ED8",
  },
  modalActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  modalSecondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },
  modalSecondaryButtonText: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800",
  },
  modalPrimaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  modalPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  bottomSpacer: {
    height: 20,
  },
});
