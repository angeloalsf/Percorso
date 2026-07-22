import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/auth/AuthProvider'
import { AuthGate } from '@/auth/AuthGate'
import { LoginPage } from '@/auth/LoginPage'
import { SignupPage } from '@/auth/SignupPage'
import { AppLayout } from '@/app/AppLayout'
import { SettingsPage } from '@/app/SettingsPage'
import { Toaster } from '@/components/ui/toaster'
import { FinancePage } from '@/features/finance/FinancePage'

export default function App() {
  return (
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
            <Route path="/finances" element={<FinancePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/finances" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </AuthProvider>
  )
}
