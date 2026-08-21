import { Navigate, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import MangaPage from './pages/MangaPage';
import ReaderPage from './pages/ReaderPage';
import StoragePage from './pages/StoragePage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/manga/:id" element={<MangaPage />} />
      <Route path="/read/:chapterId" element={<ReaderPage />} />
      <Route path="/almacenamiento" element={<StoragePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
