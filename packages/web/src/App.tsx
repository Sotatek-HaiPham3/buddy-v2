import { Navigate, Route, Routes } from 'react-router-dom';
import TopicSelect from './routes/TopicSelect.js';
import Chat from './routes/Chat.js';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<TopicSelect />} />
      <Route path="/t/:topic" element={<Chat />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
