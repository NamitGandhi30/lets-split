import { createBrowserRouter, Navigate } from "react-router";
import { AddScreen } from "../features/add/AddScreen";
import { AlertsScreen } from "../features/alerts/AlertsScreen";
import { CodeScreen } from "../features/auth/CodeScreen";
import { EmailScreen } from "../features/auth/EmailScreen";
import { ProfileScreen } from "../features/auth/ProfileScreen";
import { RedirectIfSignedIn, RequireAuth } from "../features/auth/session";
import { ExpenseScreen } from "../features/expense/ExpenseScreen";
import { OnboardingScreen } from "../features/onboarding/OnboardingScreen";
import { HomeScreen } from "../features/home/HomeScreen";
import { StatsScreen } from "../features/stats/StatsScreen";
import { JoinScreen } from "../features/trips/JoinScreen";
import { TripScreen } from "../features/trips/TripScreen";
import { AppShell } from "./AppShell";

export const router = createBrowserRouter([
  { path: "/login", element: <RedirectIfSignedIn><EmailScreen /></RedirectIfSignedIn> },
  { path: "/login/code", element: <RedirectIfSignedIn><CodeScreen /></RedirectIfSignedIn> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomeScreen /> },
      { path: "add", element: <AddScreen /> },
      { path: "stats", element: <StatsScreen /> },
      { path: "alerts", element: <AlertsScreen /> },
      { path: "me", element: <ProfileScreen /> },
      { path: "trips/:groupId", element: <TripScreen /> },
      { path: "expenses/:expenseId", element: <ExpenseScreen /> },
      { path: "expenses/:expenseId/edit", element: <AddScreen /> },
      { path: "join/:code", element: <JoinScreen /> },
      { path: "welcome", element: <OnboardingScreen /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
