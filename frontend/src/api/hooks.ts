import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "./client";
import type { components, operations } from "./schema";

type S = components["schemas"];
export type TransactionFilters = NonNullable<operations["list_transactions_api_transactions_get"]["parameters"]["query"]>;
export type OccurrenceFilters = NonNullable<operations["list_occurrences_api_occurrences_get"]["parameters"]["query"]>;

// --- Lecturas ---

export const useMe = () =>
  useQuery({
    queryKey: ["me"],
    queryFn: () => unwrap(api.GET("/api/auth/me")),
    retry: false,
    staleTime: Infinity,
  });

export const useAccounts = (includeArchived = false) =>
  useQuery({
    queryKey: ["accounts", { includeArchived }],
    queryFn: () => unwrap(api.GET("/api/accounts", { params: { query: { include_archived: includeArchived } } })),
  });

export const useCategories = () =>
  useQuery({ queryKey: ["categories"], queryFn: () => unwrap(api.GET("/api/categories")), staleTime: 60_000 });

export const useTags = () =>
  useQuery({ queryKey: ["tags"], queryFn: () => unwrap(api.GET("/api/tags")), staleTime: 60_000 });

export const useTransactions = (filters: TransactionFilters) =>
  useQuery({
    queryKey: ["transactions", filters],
    queryFn: () => unwrap(api.GET("/api/transactions", { params: { query: filters } })),
    placeholderData: keepPreviousData,
  });

export const useTransaction = (id: number | null) =>
  useQuery({
    queryKey: ["transaction", id],
    queryFn: () => unwrap(api.GET("/api/transactions/{tx_id}", { params: { path: { tx_id: id! } } })),
    enabled: id !== null,
  });

export const useSeriesList = () =>
  useQuery({ queryKey: ["recurring"], queryFn: () => unwrap(api.GET("/api/recurring")) });

export const useSeries = (id: number | null) =>
  useQuery({
    queryKey: ["recurring", id],
    queryFn: () => unwrap(api.GET("/api/recurring/{series_id}", { params: { path: { series_id: id! } } })),
    enabled: id !== null,
  });

export const useOccurrences = (filters: OccurrenceFilters) =>
  useQuery({
    queryKey: ["occurrences", filters],
    queryFn: () => unwrap(api.GET("/api/occurrences", { params: { query: filters } })),
  });

export const useDashboard = (month?: string) =>
  useQuery({
    queryKey: ["dashboard", month ?? "actual"],
    queryFn: () => unwrap(api.GET("/api/reports/dashboard", { params: { query: { month } } })),
    placeholderData: keepPreviousData,
  });

export const useRecurringCosts = () =>
  useQuery({ queryKey: ["recurring-costs"], queryFn: () => unwrap(api.GET("/api/reports/recurring-costs")) });

export const useForecast = (months: 3 | 6 | 12, includeVariable?: boolean) =>
  useQuery({
    queryKey: ["forecast", months, includeVariable ?? "pref"],
    queryFn: () =>
      unwrap(api.GET("/api/reports/forecast", { params: { query: { months, include_variable: includeVariable } } })),
    placeholderData: keepPreviousData,
  });

export const useProvisions = () =>
  useQuery({ queryKey: ["provisions"], queryFn: () => unwrap(api.GET("/api/reports/provisions")) });

export const useAppSettings = () =>
  useQuery({ queryKey: ["settings"], queryFn: () => unwrap(api.GET("/api/settings")) });

export const useBudgetMonth = (month?: string) =>
  useQuery({
    queryKey: ["budgets", "status", month ?? "actual"],
    queryFn: () => unwrap(api.GET("/api/budgets/status", { params: { query: { month } } })),
    placeholderData: keepPreviousData,
  });

export const useBudgets = () => useQuery({ queryKey: ["budgets", "list"], queryFn: () => unwrap(api.GET("/api/budgets")) });

export const useGoals = (includeArchived = false) =>
  useQuery({
    queryKey: ["goals", includeArchived],
    queryFn: () => unwrap(api.GET("/api/goals", { params: { query: { include_archived: includeArchived } } })),
  });

// --- Escrituras ---

/** Casi todo afecta a los saldos: tras cada cambio se refresca todo salvo la sesión. */
function useInvalidateData() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "me" });
}

function useApiMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const invalidate = useInvalidateData();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidate() });
}

export const useLogin = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: S["LoginIn"]) => unwrap(api.POST("/api/auth/login", { body })),
    onSuccess: (user) => {
      qc.clear();
      qc.setQueryData(["me"], user);
    },
  });
};

export const useLogout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/auth/logout")),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(["me"], null);
    },
  });
};

export const useChangePassword = () =>
  useMutation({ mutationFn: (body: S["ChangePasswordIn"]) => unwrap(api.POST("/api/auth/change-password", { body })) });

export const useSaveSettings = () =>
  useApiMutation((body: S["AppSettings-Input"]) => unwrap(api.PUT("/api/settings", { body })));

export const useSaveAccount = () =>
  useApiMutation(({ id, body }: { id?: number; body: S["AccountIn"] }) =>
    id
      ? unwrap(api.PATCH("/api/accounts/{account_id}", { params: { path: { account_id: id } }, body }))
      : unwrap(api.POST("/api/accounts", { body })),
  );

export const usePatchAccount = () =>
  useApiMutation(({ id, body }: { id: number; body: S["AccountPatch"] }) =>
    unwrap(api.PATCH("/api/accounts/{account_id}", { params: { path: { account_id: id } }, body })),
  );

export const useDeleteAccount = () =>
  useApiMutation((id: number) => unwrap(api.DELETE("/api/accounts/{account_id}", { params: { path: { account_id: id } } })));

export const useReconcile = () =>
  useApiMutation(({ id, body }: { id: number; body: S["ReconcileIn"] }) =>
    unwrap(api.POST("/api/accounts/{account_id}/reconcile", { params: { path: { account_id: id } }, body })),
  );

export const useSaveCategory = () =>
  useApiMutation(({ id, body }: { id?: number; body: S["CategoryIn"] }) =>
    id
      ? unwrap(api.PATCH("/api/categories/{category_id}", { params: { path: { category_id: id } }, body }))
      : unwrap(api.POST("/api/categories", { body })),
  );

export const useDeleteCategory = () =>
  useApiMutation((id: number) =>
    unwrap(api.DELETE("/api/categories/{category_id}", { params: { path: { category_id: id } } })),
  );

export const useSaveTag = () =>
  useApiMutation(({ id, body }: { id?: number; body: S["TagIn"] }) =>
    id
      ? unwrap(api.PATCH("/api/tags/{tag_id}", { params: { path: { tag_id: id } }, body }))
      : unwrap(api.POST("/api/tags", { body })),
  );

export const useDeleteTag = () =>
  useApiMutation((id: number) => unwrap(api.DELETE("/api/tags/{tag_id}", { params: { path: { tag_id: id } } })));

export const useSaveTransaction = () =>
  useApiMutation(({ id, body }: { id?: number; body: S["TransactionIn"] }) =>
    id
      ? unwrap(api.PUT("/api/transactions/{tx_id}", { params: { path: { tx_id: id } }, body }))
      : unwrap(api.POST("/api/transactions", { body })),
  );

export const useDeleteTransaction = () =>
  useApiMutation((id: number) => unwrap(api.DELETE("/api/transactions/{tx_id}", { params: { path: { tx_id: id } } })));

export const useDeleteAttachment = () =>
  useApiMutation((id: number) =>
    unwrap(api.DELETE("/api/attachments/{att_id}", { params: { path: { att_id: id } } })),
  );

export const useCreateSeries = () =>
  useApiMutation((body: S["SeriesIn"]) => unwrap(api.POST("/api/recurring", { body })));

export const usePatchSeries = () =>
  useApiMutation(({ id, body }: { id: number; body: S["SeriesPatch"] }) =>
    unwrap(api.PATCH("/api/recurring/{series_id}", { params: { path: { series_id: id } }, body })),
  );

export const useAddVersion = () =>
  useApiMutation(({ id, body }: { id: number; body: S["NewVersionIn"] }) =>
    unwrap(api.POST("/api/recurring/{series_id}/versions", { params: { path: { series_id: id } }, body })),
  );

export const useDeleteSeries = () =>
  useApiMutation((id: number) =>
    unwrap(api.DELETE("/api/recurring/{series_id}", { params: { path: { series_id: id } } })),
  );

export const useConfirmOccurrence = () =>
  useApiMutation(({ id, body }: { id: number; body: S["ConfirmIn"] }) =>
    unwrap(api.POST("/api/occurrences/{occ_id}/confirm", { params: { path: { occ_id: id } }, body })),
  );

export const useEditOccurrence = () =>
  useApiMutation(({ id, body }: { id: number; body: S["OccurrencePatch"] }) =>
    unwrap(api.PATCH("/api/occurrences/{occ_id}", { params: { path: { occ_id: id } }, body })),
  );

type OccurrenceAction = "unconfirm" | "skip" | "unskip" | "reset";

export const useOccurrenceAction = () =>
  useApiMutation(({ id, action }: { id: number; action: OccurrenceAction }) => {
    const params = { params: { path: { occ_id: id } } };
    switch (action) {
      case "unconfirm":
        return unwrap(api.POST("/api/occurrences/{occ_id}/unconfirm", params));
      case "skip":
        return unwrap(api.POST("/api/occurrences/{occ_id}/skip", params));
      case "unskip":
        return unwrap(api.POST("/api/occurrences/{occ_id}/unskip", params));
      case "reset":
        return unwrap(api.POST("/api/occurrences/{occ_id}/reset", params));
    }
  });

export const useSaveBudget = () =>
  useApiMutation(({ id, body }: { id?: number; body: S["BudgetIn"] }) =>
    id
      ? unwrap(api.PATCH("/api/budgets/{budget_id}", { params: { path: { budget_id: id } }, body: { amount: body.amount, alert_pct: body.alert_pct } }))
      : unwrap(api.POST("/api/budgets", { body })),
  );

export const useDeleteBudget = () =>
  useApiMutation((id: number) => unwrap(api.DELETE("/api/budgets/{budget_id}", { params: { path: { budget_id: id } } })));

export const useSetBudgetOverride = () =>
  useApiMutation(({ id, month, amount }: { id: number; month: string; amount: string | null }) =>
    amount === null
      ? unwrap(api.DELETE("/api/budgets/{budget_id}/overrides/{month}", { params: { path: { budget_id: id, month } } }))
      : unwrap(api.PUT("/api/budgets/{budget_id}/overrides", { params: { path: { budget_id: id } }, body: { month, amount } })),
  );

export const useSaveGoal = () =>
  useApiMutation(({ id, body }: { id?: number; body: S["GoalIn"] }) =>
    id
      ? unwrap(api.PUT("/api/goals/{goal_id}", { params: { path: { goal_id: id } }, body }))
      : unwrap(api.POST("/api/goals", { body })),
  );

export const useDeleteGoal = () =>
  useApiMutation((id: number) => unwrap(api.DELETE("/api/goals/{goal_id}", { params: { path: { goal_id: id } } })));

export const useAddContribution = () =>
  useApiMutation(({ id, body }: { id: number; body: S["ContributionIn"] }) =>
    unwrap(api.POST("/api/goals/{goal_id}/contributions", { params: { path: { goal_id: id } }, body })),
  );

export const useDeleteContribution = () =>
  useApiMutation(({ id, contributionId }: { id: number; contributionId: number }) =>
    unwrap(
      api.DELETE("/api/goals/{goal_id}/contributions/{contribution_id}", {
        params: { path: { goal_id: id, contribution_id: contributionId } },
      }),
    ),
  );
