# Chalé Azul · Ilhabela

Site estático em português com pedidos de reserva, painel administrativo e banco de dados Supabase. O projeto não recebe pagamentos: cada pedido precisa ser analisado e confirmado pela hospedagem.

## Colocar as reservas online

1. Crie um projeto no [Supabase](https://supabase.com/dashboard). Guarde a senha do banco em um lugar seguro; não a coloque no site.
2. No **SQL Editor** do projeto, execute todo o arquivo [`supabase-schema.sql`](./supabase-schema.sql). Ele cria a tabela de configurações públicas (incluindo os espaços das fotos), a tabela de reservas, limites de tentativas, funções de disponibilidade, o bucket público das imagens e as políticas de acesso. Se já executou uma versão anterior do SQL, execute o arquivo atualizado novamente. O pedido público agora só pode ser criado pelo endpoint protegido; o RPC de reserva não é concedido aos visitantes.
3. Em **Authentication → Settings → User Signups**, desative **Allow new users to sign up**. Em seguida, em **Authentication → Users**, crie o usuário do administrador.
4. No SQL Editor, conceda acesso administrativo apenas a essa conta. Substitua o e-mail pelo mesmo endereço que acabou de cadastrar:

   ```sql
   insert into public.admin_users (user_id)
   select id
   from auth.users
   where lower(email) = lower('SEU-EMAIL-ADMIN@EXEMPLO.COM')
   on conflict (user_id) do nothing;
   ```

   Confirme que o comando inseriu exatamente uma linha. Essa tabela não pode ser alterada pelo navegador: conceda acesso apenas a pessoas de confiança.

5. Em **Project Settings → API** (ou **Connect**), copie a **Project URL** e a chave **publishable** (ou `anon`) e preencha [`supabase-config.js`](./supabase-config.js):

   ```js
   window.CASA_DA_ILHA_CONFIG = {
     supabaseUrl: "https://seu-projeto.supabase.co",
     supabaseAnonKey: "sua-chave-publishable-ou-anon",
     turnstileSiteKey: "sua-chave-publica-turnstile",
   };
   ```

   Essa chave é pública e é usada no navegador. **Nunca** use a chave `service_role`, a chave `secret`, a senha do banco ou credenciais de administração nesse arquivo.

6. No painel do Cloudflare, crie um widget [Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile) que aceite o domínio público exato do site e copie a **site key** para `turnstileSiteKey`. Configure-o somente para seus domínios de produção e teste autorizados.
7. Instale e autentique a [Supabase CLI](https://supabase.com/docs/guides/cli) no seu computador, vincule a pasta do projeto ao projeto Supabase (`supabase link --project-ref SEU_PROJECT_REF`) e cadastre os segredos da função no Supabase, em **Edge Functions → Secrets**:
   - `ALLOWED_ORIGIN`: origem do site, somente esquema + domínio (ex.: `https://seu-dominio.com`), sem barra/caminho.
   - `SUPABASE_ANON_KEY`: a mesma chave pública `publishable`/`anon` já usada no site.
   - `TURNSTILE_SECRET_KEY`: a chave secreta fornecida pelo Turnstile; somente no servidor.
   - `RATE_LIMIT_HASH_SECRET`: segredo aleatório com pelo menos 32 caracteres, usado para gerar identificadores de limite sem salvar o IP em texto.

   O Supabase fornece `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no ambiente da Edge Function. Não copie nem configure a chave `service_role` no site, Git ou mensagens. Implante o endpoint público explicitamente sem verificação JWT (`supabase functions deploy create-reservation --no-verify-jwt`); ele verifica a chave pública esperada, origem, Turnstile, campos, consentimento e limite de tentativas no servidor. Nunca desative essas verificações dentro da função.
8. Sirva ou publique os arquivos do projeto em um endereço **HTTPS**. Para testar, publique a pasta no Netlify ou Cloudflare Pages como site estático (sem comando de build; pasta de saída `.`). O arquivo [`_headers`](./_headers) configura cabeçalhos de segurança e permite o widget Turnstile nessas plataformas. Se usar um domínio Supabase personalizado, ajuste `connect-src` nesse arquivo. Abrir os arquivos diretamente com `file://` não conecta ao Supabase.
9. Em **Authentication → URL Configuration**, configure o endereço do site e adicione `https://SEU-DOMINIO/admin.html` à lista de redirecionamentos permitidos. Configure envio de e-mail/SMTP antes de depender da recuperação de senha.
10. Acesse `https://SEU-DOMINIO/admin.html`, entre com a conta administrativa e informe a diária e a taxa de limpeza corretas. A diária fica sem preço até esse passo. Configure também a ocupação máxima e o WhatsApp da hospedagem; o botão de WhatsApp só aparece quando o número é salvo.
11. Em **Descrição e localização**, personalize o texto de apresentação, o endereço/região e o link do mapa. O endereço/região e o link ficam públicos; use apenas o bairro ou a região se não quiser divulgar o endereço completo.
12. Em **Antes de reservar**, configure horários, regras, formas de pagamento, taxas e cancelamento. Esses campos são opcionais e só aparecem no site quando preenchidos. Publique apenas condições que a hospedagem realmente pratique.
13. No painel, em **Fotos do site**, envie a foto de capa e as cinco fotos da galeria. Descreva cada imagem para acessibilidade. Fotos horizontais de pelo menos 1600 × 1000 px ficam melhores na capa. Use fotos próprias da hospedagem e imagens autorizadas: o navegador redimensiona e comprime cada imagem para WebP de até 2400 × 1800 px, apaga metadados da imagem e envia o resultado para um bucket público do Supabase. O limite é 20 MB para o arquivo escolhido e 8 MB para a versão otimizada.
14. Revise e personalize [`privacidade.html`](./privacidade.html), informe aos hóspedes os canais de contato da hospedagem e defina um procedimento de retenção e exclusão de pedidos conforme sua operação e legislação aplicável. O formulário exige o aceite para análise do pedido.
15. Faça um pedido de teste no domínio autorizado, confirme que ele aparece no painel, confira a tarifa e teste os status. Remova os pedidos de teste antes de divulgar o site.

## Regras importantes

- Visitantes podem solicitar uma estadia, mas não conseguem consultar os dados de outros hóspedes. O acesso às reservas e à tabela de preços é protegido por políticas RLS; só contas cadastradas em `admin_users` podem abrir o painel.
- As datas são validadas e bloqueadas de forma atômica no banco. Pedidos aguardando resposta também reservam as datas temporariamente; confirme ou recuse cada pedido no painel.
- O preço é calculado no banco com a diária e a taxa de limpeza atuais. O total fica registrado no pedido e não muda quando a tarifa é alterada depois.
- O site não processa pagamentos, não confirma automaticamente estadias e não integra calendário externo, e-mail de notificação nem WhatsApp de saída. A hospedagem deve responder ao hóspede após receber o pedido.
- Os pedidos passam pela Edge Function `create-reservation`: ela exige Turnstile com validação server-side, origem HTTPS configurada, consentimento, honeypot e no máximo cinco tentativas por IP a cada 15 minutos. A função usa HMAC com `RATE_LIMIT_HASH_SECRET`; apenas o hash temporário do IP é armazenado, com remoção de entradas antigas ao processar pedidos seguintes. Isso reduz abuso automatizado, mas não garante proteção contra ataques distribuídos. Monitore uso e custos do Supabase/Turnstile.
- A chave publishable/`anon` é segura somente enquanto as políticas do banco estiverem ativas. Não publique a chave `service_role`.
- A capacidade máxima da hospedagem é de quatro hóspedes. O SQL limita a configuração a quatro e ajusta configurações existentes acima desse limite.
- E-mails automáticos de confirmação/aviso não estão configurados. Para adicioná-los, use um provedor de e-mail e uma função server-side; nunca coloque chaves secretas no JavaScript público.
- Antes de operar, defina e publique informações reais da hospedagem, canais de contato, condições de pagamento/cancelamento e um aviso de privacidade compatível com a forma como os dados dos hóspedes serão usados. Revise também cópias de segurança e quem pode acessar o painel.
