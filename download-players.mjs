import fs from 'fs';
import path from 'path';
import https from 'https';

const players = [
  { name: 'trubin.png', url: 'https://images.fotmob.com/image_resources/playerimages/1110594.png' },
  { name: 'soares.png', url: 'https://images.fotmob.com/image_resources/playerimages/1077759.png' },
  { name: 'araujo.png', url: 'https://images.fotmob.com/image_resources/playerimages/1077758.png' },
  { name: 'bah.png', url: 'https://images.fotmob.com/image_resources/playerimages/740871.png' },
  { name: 'lenglet.png', url: 'https://images.fotmob.com/image_resources/playerimages/474706.png' },
  { name: 'circati.png', url: 'https://images.fotmob.com/image_resources/playerimages/1301986.png' },
  { name: 'dahl.png', url: 'https://images.fotmob.com/image_resources/playerimages/1220054.png' },
  { name: 'obrador.png', url: 'https://images.fotmob.com/image_resources/playerimages/1169601.png' },
  { name: 'banjaqui.png', url: 'https://images.fotmob.com/image_resources/playerimages/1614605.png' },
  { name: 'aursnes.png', url: 'https://images.fotmob.com/image_resources/playerimages/547514.png' },
  { name: 'sudakov.png', url: 'https://images.fotmob.com/image_resources/playerimages/1199343.png' },
  { name: 'barrenechea.png', url: 'https://images.fotmob.com/image_resources/playerimages/1162985.png' },
  { name: 'palhinha.png', url: 'https://images.fotmob.com/image_resources/playerimages/476313.png' },
  { name: 'barreiro.png', url: 'https://images.fotmob.com/image_resources/playerimages/861759.png' },
  { name: 'echeverri.png', url: 'https://images.fotmob.com/image_resources/playerimages/1498679.png' },
  { name: 'manusilva.png', url: 'https://images.fotmob.com/image_resources/playerimages/1321946.png' },
  { name: 'prioste.png', url: 'https://images.fotmob.com/image_resources/playerimages/1169599.png' },
  { name: 'pavlidis.png', url: 'https://images.fotmob.com/image_resources/playerimages/751786.png' },
  { name: 'lukebakio.png', url: 'https://images.fotmob.com/image_resources/playerimages/710078.png' },
  { name: 'duran.png', url: 'https://images.fotmob.com/image_resources/playerimages/1118116.png' },
  { name: 'prestianni.png', url: 'https://images.fotmob.com/image_resources/playerimages/1381254.png' },
  { name: 'schjelderup.png', url: 'https://images.fotmob.com/image_resources/playerimages/1151608.png' },
  { name: 'kaminski.png', url: 'https://images.fotmob.com/image_resources/playerimages/1077366.png' },
  { name: 'bruma.png', url: 'https://images.fotmob.com/image_resources/playerimages/303975.png' },
  { name: 'rafasilva.png', url: 'https://images.fotmob.com/image_resources/playerimages/388274.png' },
  { name: 'marcosilva.png', url: 'https://images.fotmob.com/image_resources/playerimages/24255.png' }
];

const destDir = path.join(process.cwd(), 'public', 'players');
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

console.log('A descarregar fotografias para public/players/...');

for (const p of players) {
  const filePath = path.join(destDir, p.name);
  const file = fs.createWriteStream(filePath);

  https.get(p.url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    res.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log(`✓ Descarregado: ${p.name}`);
    });
  }).on('error', (err) => {
    console.error(`Erro ao descarregar ${p.name}:`, err.message);
  });
}