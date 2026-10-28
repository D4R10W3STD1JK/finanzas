import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { ApiError, UNAUTHORIZED_EVENT } from "./api/client";
import { useMe } from "./api/hooks";
import { PageLoader } from "./components/ui";
import Layout from "./components/Layout";
import "./index.css";
import AccountsPage from "./pages/Accounts";
import CategoriesPage from "./pages/Categories";
import HomePage from "./pages/Home";
import LoginPage from "./pages/Login";
import RecurringPage from "./pages/Recurring";
import SeriesDetailPage from "./pages/SeriesDetail";
import SettingsPage from "./pages/Settings";
import TransactionsPage from "./pages/Transactions";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

function App() {
  const me = useMe();

  useEffect(() => {
    const onUnauthorized = () => queryClient.setQueryData(["me"], null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (me.isPending) return <PageLoader />;
  if (!me.data) return <LoginPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="movimientos" element={<TransactionsPage />} />
        <Route path="recurrentes" element={<RecurringPage />} />
        <Route path="recurrentes/:id" element={<SeriesDetailPage />} />
        <Route path="cuentas" element={<AccountsPage />} />
        <Route path="categorias" element={<CategoriesPage />} />
        <Route path="ajustes" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
