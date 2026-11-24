import { HashRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Generation from './pages/Generation.jsx';
import Characterisation from './pages/Characterisation.jsx';
import Handling from './pages/Handling.jsx';
import Technology from './pages/Technology.jsx';
import Compliance from './pages/Compliance.jsx';
import Reports from './pages/Reports.jsx';

export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/generation" element={<Generation />} />
          <Route path="/characterisation" element={<Characterisation />} />
          <Route path="/handling" element={<Handling />} />
          <Route path="/technology" element={<Technology />} />
          <Route path="/compliance" element={<Compliance />} />
          <Route path="/reports" element={<Reports />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
}
