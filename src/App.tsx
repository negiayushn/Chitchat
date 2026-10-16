import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './features/auth/AuthProvider'
import { LoginPage, ProfileSetupPage, RegisterPage } from './features/auth/AuthPages'
import { ForgotPasswordPage, ResetPasswordPage } from './features/auth/PasswordPages'
import { Protected } from './routes/Guard'
import { ChatLayout } from './routes/ChatLayout'

export default function App() {
  return <AuthProvider><BrowserRouter><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/forgot" element={<ForgotPasswordPage />} />
    <Route path="/reset" element={<ResetPasswordPage />} />
    <Route path="/setup" element={<ProfileSetupPage />} />
    <Route element={<Protected />}>
      <Route path="/" element={<ChatLayout />} />
      <Route path="/c/:id" element={<ChatLayout />} />
    </Route>
  </Routes></BrowserRouter></AuthProvider>
}
