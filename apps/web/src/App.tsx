import './App.css';

export function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1>Seu dia de hoje</h1>
      </header>

      <main>
        <section className="empty" aria-labelledby="vazio-titulo">
          <h2 id="vazio-titulo">Nenhum horário marcado ainda</h2>
          <p>
            Quando uma cliente marcar pelo WhatsApp, o horário aparece aqui. O próximo passo é
            cadastrar seus serviços e horários.
          </p>
        </section>
      </main>

      <footer className="app__footer">feito pela nexo</footer>
    </div>
  );
}
