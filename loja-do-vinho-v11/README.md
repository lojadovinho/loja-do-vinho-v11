# 🍷 Loja do Vinho — V11 FINAL

A V11 é a versão de consolidação do projeto. Ela reúne o e-commerce, PWA/app, autenticação, catálogo conectado ao PDV, preços por forma de pagamento, delivery, Melhor Envio, PagBank, WhatsApp, CRM, notificações, fidelidade, antifraude operacional e fila de integração com o PDV.

## O que está consolidado

- SITE responsivo e PWA instalável.
- Catálogo alimentado pelo PDV em modo somente leitura.
- Nome, categoria, preço e estoque operacional vindos do PDV.
- Fotos e conteúdo comercial mantidos no e-commerce.
- Preço por forma de pagamento e escopo LOCAL/NATIONAL.
- Juazeiro-BA e Petrolina-PE tratados como operação local.
- Demais cidades tratadas como operação nacional.
- Delivery por cidade/bairro e horário configurável.
- Melhor Envio preparado para cotação nacional.
- PagBank preparado para checkout e webhook.
- WhatsApp preparado para confirmação e atualização do pedido.
- Linha do tempo do pedido.
- Código de entrega para delivery.
- Sinais básicos de risco para conferência humana.
- Login por senha, Google e Passkey/WebAuthn/biometria quando HTTPS estiver configurado.
- Programa de fidelidade conservador e configurável.
- Cupons.
- Push/CRM/campanhas.
- Página “Quem Somos”.
- Fila idempotente para integração com PDV.
- Conciliação PDV x reservas online.
- Auditoria e health check.
- Cabeçalhos básicos de segurança e encerramento gracioso do servidor.

## Importante: o que ainda depende de configuração externa

O código está preparado, mas não existe “produção automática” sem as contas e credenciais reais:

1. PagBank: token e URLs HTTPS de produção.
2. Melhor Envio: OAuth/token e CEP de origem.
3. WhatsApp Business Cloud/API: token, phone number ID e templates aprovados quando exigidos.
4. Firebase Cloud Messaging: credenciais do projeto para push.
5. Google Identity: Client ID e origens autorizadas.
6. Domínio HTTPS, banco PostgreSQL, backups e monitoramento.
7. Mecanismo oficial do seu software PDV para receber vendas externas. A leitura do SQLite está pronta e continua somente leitura; a escrita automática não é feita por segurança.
8. Política de privacidade, termos de compra e informações cadastrais devem ser revisados/preenchidos com os dados jurídicos definitivos antes da publicação.

## Instalação

```bash
npm install
npm run prisma:generate
npx prisma migrate deploy
npm run seed
npm start
```

Para desenvolvimento de schema, use `npx prisma migrate dev --name v11` em um ambiente de desenvolvimento.

## PDV

```env
PDV_DB_PATH=/caminho/seguro/pdv_local.db
PDV_AUTO_SYNC=true
PDV_SYNC_INTERVAL_MINUTES=15
```

O arquivo do PDV não deve ficar dentro de `public/` nem ser disponibilizado pela internet. Faça backup antes da implantação.

## Produção

- `NODE_ENV=production`
- `APP_URL=https://seu-dominio`
- `JWT_SECRET` longo e aleatório
- PostgreSQL com senha forte e acesso restrito
- HTTPS obrigatório para Passkeys, callbacks e operação pública
- backups automáticos
- monitoramento de logs
- credenciais somente em variáveis de ambiente/secret manager
- revisar CORS, cookies, rate limiting e políticas definitivas antes da abertura pública

## Checklist de go-live

- [ ] Domínio e HTTPS
- [ ] PostgreSQL de produção
- [ ] Migrações aplicadas
- [ ] Backup testado
- [ ] PagBank sandbox testado e depois produção
- [ ] Melhor Envio sandbox/teste e depois produção
- [ ] WhatsApp testado
- [ ] Google login configurado
- [ ] Passkeys testadas em Android/iPhone/desktop compatíveis
- [ ] Push testado
- [ ] PDV sincronizando em somente leitura
- [ ] Fluxo de reserva/cancelamento de estoque testado
- [ ] Fila de pedidos testada
- [ ] Delivery por bairro conferido
- [ ] Código de entrega testado
- [ ] Política de privacidade e termos revisados
- [ ] Dados “Quem Somos” preenchidos
- [ ] Preços por PIX/cartão conferidos
- [ ] Teste de compra completo em ambiente controlado

**A V11 é a última versão de desenvolvimento/consolidação. A abertura pública só deve ocorrer depois do checklist acima e dos testes com as credenciais reais.**
