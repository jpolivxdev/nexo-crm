// Cria (ou atualiza) a fila de tarefas do pg-boss no schema "pgboss", com o papel dono das tabelas,
// e dá ao papel da aplicação só o necessário para usar a fila. Rode depois de `db:deploy`.
// A aplicação sobe com migrate/createSchema desligados: ela nunca cria nem altera estrutura.
import pg from 'pg';
import { PgBoss } from 'pg-boss';

const migrationUrl = process.env.DATABASE_MIGRATION_URL;
if (!migrationUrl) {
  console.error('Defina DATABASE_MIGRATION_URL no .env (veja .env.example).');
  process.exit(1);
}

const SCHEMA = 'pgboss';
// Mesmas filas e políticas de src/queue/queues.ts.
const QUEUES = {
  // Conteúdo de mensagem passa por aqui: guarda pouco (SEGURANCA.md, tabela de dados).
  'inbound-message': {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInSeconds: 120,
    retentionSeconds: 60 * 60 * 24,
    deleteAfterSeconds: 60 * 60,
  },
};

const boss = new PgBoss({
  connectionString: migrationUrl,
  schema: SCHEMA,
  supervise: false,
  schedule: false,
});
boss.on('error', (error) => console.error(error.message));
await boss.start();
for (const [name, options] of Object.entries(QUEUES)) {
  if (await boss.getQueue(name)) await boss.updateQueue(name, options);
  else await boss.createQueue(name, options);
}
await boss.stop({ graceful: false });

const client = new pg.Client({ connectionString: migrationUrl });
await client.connect();
try {
  await client.query(`GRANT USAGE ON SCHEMA ${SCHEMA} TO nexo_app`);
  await client.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${SCHEMA} TO nexo_app`,
  );
  await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${SCHEMA} TO nexo_app`);
  await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${SCHEMA} TO nexo_app`);
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${SCHEMA} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nexo_app`,
  );
  console.log('Fila pronta no schema pgboss.');
} finally {
  await client.end();
}
