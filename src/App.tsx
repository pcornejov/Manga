import { Navigate, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import MangaPage from './pages/MangaPage';
import ReaderPage from './pages/ReaderPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/manga/:id" element={<MangaPage />} />
      <Route path="/read/:chapterId" element={<ReaderPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
