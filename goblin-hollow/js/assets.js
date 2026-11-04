/* Image loading + modular goblin compositing */
export const Assets = {
  img: {},
  enemySheets: [],
  rockTile: null,
  mossTile: null,
  done: false,
  failed: [],

  files: [
    ['base', 'assets/goblin/base.png'],
    ['outfitPeasant', 'assets/goblin/outfits/peasant.brown.png'],
    ['outfitAssassin', 'assets/goblin/outfits/assassin.gray.png'],
    ['outfitRobe', 'assets/goblin/outfits/robe.blue.png'],
    ['hatHood', 'assets/goblin/hats/cowl.gray.png'],
    ['hatHelm', 'assets/goblin/hats/roundHelm.png'],
    ['hatCrown', 'assets/goblin/hats/crown.gold.png'],
    ['sword', 'assets/goblin/weapons/sword.png'],
    ['dagger', 'assets/goblin/weapons/dagger.png'],
    ['hammer', 'assets/goblin/weapons/hammer.png'],
    ['rock', 'assets/tiles/rock.png'],
  ],

  load(onDone) {
    let remaining = this.files.length;
    const finish = () => {
      remaining--;
      if (remaining > 0) return;
      this.done = true;
      this._buildEnemySheets();
      this._buildTiles();
      onDone();
    };

    for (const [key, src] of this.files) {
      const im = new Image();
      im.onload = finish;
      im.onerror = () => {
        this.failed.push(src);
        finish();
      };
      im.src = src;
      this.img[key] = im;
    }
  },

  _tint(source, color, strength) {
    const c = document.createElement('canvas');
    c.width = source.width;
    c.height = source.height;
    const g = c.getContext('2d');
    g.drawImage(source, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = color;
    g.globalAlpha = strength;
    g.fillRect(0, 0, c.width, c.height);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    return c;
  },

  _buildEnemySheets() {
    const base = this.img.base;
    if (!base) return;
    this.enemySheets = [
      this._tint(base, '#2a0b3d', 0.72),
      this._tint(base, '#3d0a0a', 0.70),
    ];
  },

  // Build tileable stone + moss textures from the Tile Map sheet.
  _buildTiles() {
    const src = this.img.rock;
    if (!src || !src.naturalWidth) return;

    const S = 1.5;                 // texture scale relative to world pixels
    const body = { x: 0, y: 10, w: 93, h: 76 };
    const bw = Math.round(body.w * S);
    const bh = Math.round(body.h * S);

    // one scaled copy of the rock body
    const tile = document.createElement('canvas');
    tile.width = bw;
    tile.height = bh;
    const tg = tile.getContext('2d');
    tg.imageSmoothingEnabled = false;
    tg.drawImage(src, body.x, body.y, body.w, body.h, 0, 0, bw, bh);

    // mirror it into a 2x2 block so the texture is seamless
    const rock = document.createElement('canvas');
    rock.width = bw * 2;
    rock.height = bh * 2;
    const rg = rock.getContext('2d');
    rg.imageSmoothingEnabled = false;
    rg.drawImage(tile, 0, 0);
    rg.save(); rg.translate(bw * 2, 0); rg.scale(-1, 1); rg.drawImage(tile, 0, 0); rg.restore();
    rg.save(); rg.translate(0, bh * 2); rg.scale(1, -1); rg.drawImage(tile, 0, 0); rg.restore();
    rg.save(); rg.translate(bw * 2, bh * 2); rg.scale(-1, -1); rg.drawImage(tile, 0, 0); rg.restore();

    // darken + cool it into the horror palette
    rg.globalCompositeOperation = 'multiply';
    rg.fillStyle = 'rgb(88, 98, 124)';
    rg.fillRect(0, 0, rock.width, rock.height);
    rg.globalCompositeOperation = 'source-over';

    // mossy top cap strip
    const mw = Math.round(93 * S);
    const mh = Math.round(12 * S);
    const moss = document.createElement('canvas');
    moss.width = mw;
    moss.height = mh;
    const mg = moss.getContext('2d');
    mg.imageSmoothingEnabled = false;
    mg.drawImage(src, 0, 0, 93, 12, 0, 0, mw, mh);
    mg.globalCompositeOperation = 'multiply';
    mg.fillStyle = 'rgb(96, 110, 110)';
    mg.fillRect(0, 0, mw, mh);
    mg.globalCompositeOperation = 'source-over';

    this.rockTile = rock;
    this.mossTile = moss;
  },

  // The player is built from stackable layers on the shared 320x256 grid.
  playerLook() {
    return [
      { img: this.img.base },
      { img: this.img.outfitPeasant },
      { img: this.img.hatHood },
    ];
  },

  enemyLook(i) {
    return [{ img: this.enemySheets[i % Math.max(1, this.enemySheets.length)] }];
  },
};
