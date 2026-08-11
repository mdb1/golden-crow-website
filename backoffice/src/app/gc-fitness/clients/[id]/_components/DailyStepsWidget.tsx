// DailyStepsWidget.tsx — daily steps on the coach's client profile.
//
// The client already sees this number in the app's Progress tab (iOS reads it
// straight from HealthKit); the coach has never been able to. This is the
// read-side. The WRITE side — iOS/HealthKit and Android/Health Connect syncing
// the day's count to `/users/{uid}/daily_steps/{civilDate}` — is a separate PR
// per platform, so today this renders an honest "the app doesn't report steps
// yet" rather than a zero line, which would read as a client who never walks.
//
// See lib/gc-fitness/daily-steps.ts for the contract those writers target.

import { getTranslations } from "next-intl/server";

import { civilDateFormat } from "@/lib/gc-fitness/civil-date";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { listDailySteps } from "@/lib/gc-fitness/daily-steps";

import { addCivilDays } from "./trend-range";
import { DailyStepsClient } from "./DailyStepsClient";

const MAX_LOOKBACK_DAYS = 365;

export async function DailyStepsWidget({
  clientId,
  timezone,
}: {
  clientId: string;
  timezone: string;
}) {
  const t = await getTranslations("clients.detail.dailySteps");
  const today = civilDateFormat(new Date(), timezone);
  const windowStart = addCivilDays(today, -(MAX_LOOKBACK_DAYS - 1));

  const points = await listDailySteps(
    gcFitnessFirestore(),
    clientId,
    windowStart,
  );

  return (
    <DailyStepsClient
      points={points}
      today={today}
      rangeStarts={{
        all: windowStart,
        "90": addCivilDays(today, -89),
        "30": addCivilDays(today, -29),
        "7": addCivilDays(today, -6),
      }}
      labels={{
        title: t("title"),
        subtitle: t("subtitle"),
        empty: t("empty"),
        statAverage: t("statAverage"),
        statBest: t("statBest"),
        statTotal: t("statTotal"),
        unit: t("unit"),
        barLabel: t("barLabel"),
        ranges: {
          all: t("rangeAll"),
          "90": t("range90"),
          "30": t("range30"),
          "7": t("range7"),
        },
      }}
    />
  );
}
