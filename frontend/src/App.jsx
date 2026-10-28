import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Admin from './components/Admin';
import Exam from './components/Exam';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="navbar">
          <h1>AI Exam System</h1>
          <nav>
            <NavLink to="/" end>Home</NavLink>
            <NavLink to="/admin">Admin</NavLink>
            <NavLink to="/exam">Exam</NavLink>
          </nav>
        </nav>
        <main className="page">
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/exam" element={<Exam />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
