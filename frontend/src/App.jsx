import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Login from './components/Login';
import Admin from './components/Admin';
import Exam from './components/Exam';
import Results from './components/Results';

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
            <NavLink to="/results">Results</NavLink>
          </nav>
        </nav>
        <main className="page">
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/exam" element={<Exam />} />
            <Route path="/results" element={<Results />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
