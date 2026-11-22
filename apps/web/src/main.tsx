import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { ApiError } from "./api/client";
import { registerMutations } from "./api/mutations";
import { router } from "./app/router";
import { installNativeShell } from "./lib/appShell";
import { keepUpToDate } from "./lib/updates";
import { SessionProvider } from "./features/auth/session";
import "./index.css";
import { ToastProvider } from "./ui/Toast";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 7 * 24 * 60 * 60_000,
      retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
      refetchOnWindowFocus: true,
      // Show the cached trip while offline instead of an error.
      networkMode: "offlineFirst",
    },
    mutations: { networkMode: "online" },
  },
});
registerMutations(queryClient);

// The cache and any writes queued while offline live in localStorage, so the app opens instantly
// with the last data and finishes queued writes on the next launch.
const persister = createSyncStoragePersister({
  storage: typeof window === "undefined" ? undefined : window.localStorage,
  key: "lets-split-cache-v2",
  throttleTime: 1000,
});

installNativeShell();
if (import.meta.env.PROD) keepUpToDate();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 7 * 24 * 60 * 60_000,
          buster: "2",
          dehydrateOptions: { shouldDehydrateMutation: (m) => m.state.isPaused || m.state.status === "pending" },
        }}
        onSuccess={() => queryClient.resumePausedMutations()}
      >
        <SessionProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </SessionProvider>
      </PersistQueryClientProvider>
    </MotionConfig>
  </StrictMode>,
);
