const express = require('express');
const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

async function run() {
  const client = new Client({ puppeteer: { headless: true } });

  let isFirstMessageReceived = false; // Variável para rastrear se a primeira mensagem foi recebida
  let cart = []; // Carrinho de compras
  let totalAmount = 0; // Valor total da compra

  function handleMessages() {
    client.on('message', async (message) => {
      if (!isFirstMessageReceived) {
        isFirstMessageReceived = true;
        const welcomeMessage = 'Bem-vindo(a)! Como posso ajudar hoje?\n';
        const menuMessage = 'Menu:\n1. X-Salada - R$ 10.99\n2. X-Tudo - R$ 20.49\n3. X-Bacon - R$ 15.99\n0. Finalizar Pedido\n';

        if (message.body.trim().length > 0) {
          message.reply(welcomeMessage + menuMessage);
        }
      } else {
        if (message.body.trim().length > 0) {
          const customerMessage = message.body.trim();
          let replyMessage;

          if (customerMessage === '0') {
            // Finalizar o pedido e exibir detalhes
            replyMessage = 'Resumo do Pedido:\n';
            for (const product of cart) {
              replyMessage += `${product.name} - R$ ${product.price.toFixed(2)}\n`;
            }
            replyMessage += `Total: R$ ${totalAmount.toFixed(2)}`;

            // Reinicializar o carrinho e o valor total
            cart = [];
            totalAmount = 0;

            // Remover o listener de mensagem após exibir o resumo do pedido
            client.removeAllListeners('message');
          } else if (customerMessage === '1' || customerMessage === '2' || customerMessage === '3') {
            const product = getProductById(customerMessage);
            if (product) {
              cart.push(product);
              totalAmount += product.price;
              replyMessage = `Você adicionou ${product.name} ao carrinho. Deseja adicionar mais algum item no carrinho? Para finalizar o pedido, envie o número 0.\n`;
            } else {
              replyMessage = 'Produto inválido. Por favor, escolha uma opção válida.\n';
            }
          } else {
            replyMessage = 'Opção inválida. Por favor, escolha uma opção válida.\n';
          }

          message.reply(replyMessage);
        }
      }
    });
  }

  function getProductById(id) {
    const products = [
      { id: '1', name: 'X-Salada', price: 10.99 },
      { id: '2', name: 'X-Tudo', price: 20.49 },
      { id: '3', name: 'X-Bacon', price: 15.99 },
    ];

    return products.find((product) => product.id === id);
  }

  client.on('qr', async (qrCode) => {
    console.log('Código QR recebido. Gerando página HTML com o QR Code...');

    const qrCodeDataURL = await qrcode.toDataURL(qrCode);
    const qrCodeMessage = JSON.stringify({ type: 'qrcode', qrCode: qrCodeDataURL });

    // Enviar o QR Code para todas as conexões WebSocket
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(qrCodeMessage);
      }
    });
  });

  client.on('authenticated', (session) => {
    console.log('Autenticado');
    console.log('Dados da sessão:', session);
  });

  client.on('ready', () => {
    console.log('Sessão do WhatsApp está pronta.');
    handleMessages();
  });

  client.on('auth_failure', (error) => {
    console.error('Falha na autenticação:', error);
  });

  client.on('disconnected', (reason) => {
    console.log('Desconectado:', reason);
    process.exit(1);
  });

  await client.initialize();
}

run().catch(console.error);

wss.on('connection', (ws) => {
  console.log('Conexão WebSocket estabelecida.');

  ws.on('message', (message) => {
    if (message === 'request_qrcode') {
      // Solicitar o QR Code
      client.on('qr', async (qrCode) => {
        const qrCodeDataURL = await qrcode.toDataURL(qrCode);
        const qrCodeMessage = JSON.stringify({ type: 'qrcode', qrCode: qrCodeDataURL });

        ws.send(qrCodeMessage);
      });
    }
  });
});

server.listen(process.env.PORT || 8080, () => {
  console.log('Servidor iniciado. Aguardando conexões na porta ' + (process.env.PORT || 8080) + '...');
});

