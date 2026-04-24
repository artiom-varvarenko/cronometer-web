import { ru } from './i18n/ru';

export default function App() {
  return (
    <main className="app-shell">
      <h1>{ru.appTitle}</h1>
      <p>{ru.scaffoldPlaceholder}</p>
    </main>
  );
}
