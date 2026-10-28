import type { components } from "./schema";

type S = components["schemas"];

export type User = S["UserOut"];
export type Account = S["AccountOut"];
export type AccountIn = S["AccountIn"];
export type AccountType = S["AccountType"];
export type Category = S["CategoryOut"];
export type CategoryIn = S["CategoryIn"];
export type CategoryKind = S["CategoryKind"];
export type Tag = S["TagOut"];
export type Transaction = S["TransactionOut"];
export type TransactionIn = S["TransactionIn"];
export type TransactionKind = S["TransactionKind"];
export type TransactionPage = S["TransactionPage"];
export type Attachment = S["AttachmentOut"];
export type Series = S["SeriesOut"];
export type SeriesDetail = S["SeriesDetail"];
export type SeriesIn = S["SeriesIn"];
export type VersionTerms = S["VersionTerms"];
export type Version = S["VersionOut"];
export type Occurrence = S["OccurrenceOut"];
export type OccurrenceStatus = S["OccurrenceStatus"];
export type Frequency = S["Frequency"];
export type Unit = S["Unit"];
export type BusinessDayAdjust = S["BusinessDayAdjust"];
export type AmountMode = S["AmountMode"];
