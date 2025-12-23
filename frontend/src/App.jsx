import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Victims from './pages/Victims';
import Monitors from './pages/Monitors';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/victims" element={<Victims />} />
        <Route path="/monitors" element={<Monitors />} />
      </Routes>
    </Layout>
  );
}

export default App;
