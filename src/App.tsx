import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage';
import MangaPage from './pages/MangaPage';
import ReaderPage from './pages/ReaderPage';
import LibraryPage from './pages/LibraryPage';
import SettingsPage from './pages/SettingsPage';
import StoragePage from './pages/StoragePage';
import BottomNav from './components/BottomNav';
import UpdatePrompt from './components/UpdatePrompt';

export default function App() {
  // La clave por ruta reinicia la animación en cada cambio de pantalla.
  const { pathname } = useLocation();

  return (
    <>
      <div key={pathname} className="page-enter">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/manga/:id" element={<MangaPage />} />
          <Route path="/read/:chapterId" element={<ReaderPage />} />
          <Route path="/biblioteca" element={<LibraryPage />} />
          <Route path="/almacenamiento" element={<StoragePage />} />
          <Route path="/ajustes" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <BottomNav />
      <UpdatePrompt />
    </>
  );
}
