import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/auth/AuthProvider'
import { AuthGate } from '@/auth/AuthGate'
import { LoginPage } from '@/auth/LoginPage'
import { SignupPage } from '@/auth/SignupPage'
import { AppLayout } from '@/app/AppLayout'
import { ErrorBoundary } from '@/app/ErrorBoundary'
import { SettingsPage } from '@/app/SettingsPage'
import { HomePage } from '@/app/HomePage'
import { Toaster } from '@/components/ui/toaster'
import { FinancePage } from '@/features/finance/FinancePage'
import { AccountDetailPage } from '@/features/finance/accounts/AccountDetailPage'
import { AccountItemPage } from '@/features/finance/accounts/AccountItemPage'
import { PageSkeleton } from '@/components/ui/page-skeleton'

const RoutinePage = lazy(() =>
  import('@/features/routine/RoutinePage').then((module) => ({ default: module.RoutinePage }))
)

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public: redirect away when already signed in. */}
            <Route element={<AuthGate />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
            </Route>
            {/* Protected: redirect to /login without a session. */}
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/finances" element={<FinancePage />} />
              <Route
                path="/routine"
                element={
                  <Suspense fallback={<PageSkeleton />}>
                    <RoutinePage />
                  </Suspense>
                }
              />
              <Route path="/calendar" element={<Navigate to="/routine" replace />} />
              {/* Bank-account drill-down: list → account (tabs) → one item. */}
              <Route path="/finances/accounts/:accountId" element={<AccountDetailPage />} />
              <Route path="/finances/accounts/:accountId/:kind/:itemId" element={<AccountItemPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster />
      </AuthProvider>
    </ErrorBoundary>
  )
}
