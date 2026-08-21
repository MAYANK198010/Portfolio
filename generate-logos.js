import fs from 'fs';
import sharp from 'sharp';

// 1. Standalone MZ Mark SVG (for Favicon and App Icon)
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <!-- Gradients -->
    <linearGradient id="orbitGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0066ff"/>
      <stop offset="60%" stop-color="#00c2ff"/>
      <stop offset="100%" stop-color="#00f0ff"/>
    </linearGradient>

    <linearGradient id="mDark1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0e1726"/>
      <stop offset="50%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0b1120"/>
    </linearGradient>

    <linearGradient id="mDark2" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="60%" stop-color="#334155"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>

    <linearGradient id="mGloss" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#475569"/>
      <stop offset="40%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#090d16"/>
    </linearGradient>

    <linearGradient id="zCyanBlue" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f0ff"/>
      <stop offset="30%" stop-color="#00b4d8"/>
      <stop offset="70%" stop-color="#0077b6"/>
      <stop offset="100%" stop-color="#023e8a"/>
    </linearGradient>

    <linearGradient id="zBrightTop" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0080ff"/>
      <stop offset="50%" stop-color="#00d4ff"/>
      <stop offset="100%" stop-color="#48cae4"/>
    </linearGradient>

    <linearGradient id="zBottomWave" x1="0%" y1="50%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f0ff"/>
      <stop offset="35%" stop-color="#0096c7"/>
      <stop offset="75%" stop-color="#0077b6"/>
      <stop offset="100%" stop-color="#03045e"/>
    </linearGradient>

    <linearGradient id="leafGrad1" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0077b6"/>
      <stop offset="60%" stop-color="#00b4d8"/>
      <stop offset="100%" stop-color="#90e0ef"/>
    </linearGradient>

    <linearGradient id="leafGrad2" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#023e8a"/>
      <stop offset="50%" stop-color="#0096c7"/>
      <stop offset="100%" stop-color="#48cae4"/>
    </linearGradient>

    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Orbital Cyber Arc -->
  <path d="M 155 310 A 165 165 0 1 1 300 78" 
        fill="none" 
        stroke="url(#orbitGrad)" 
        stroke-width="15" 
        stroke-linecap="round" 
        filter="url(#glow)"/>

  <!-- Origami Letter M: Left Pillar -->
  <path d="M 160 115 L 205 150 L 205 340 L 160 370 Z" fill="url(#mDark1)"/>
  <path d="M 160 115 L 210 115 L 210 340 L 160 340 Z" fill="url(#mGloss)" opacity="0.6"/>
  <path d="M 160 115 L 180 100 L 205 150 Z" fill="#475569"/>

  <!-- Code Bracket </> in top notch -->
  <g fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 222 108 L 210 118 L 222 128" />
    <path d="M 233 98 L 225 138" />
    <path d="M 236 108 L 248 118 L 236 128" />
  </g>

  <!-- Origami Letter M: Center V and Right Stem -->
  <path d="M 205 150 L 255 240 L 275 195 L 205 150 Z" fill="url(#mDark2)"/>
  <path d="M 255 240 L 295 160 L 330 195 L 285 285 Z" fill="url(#mDark1)"/>

  <!-- Letter Z: Top Horizontal Bar -->
  <path d="M 285 115 L 395 115 C 410 115 410 135 390 155 L 340 200 L 295 160 L 285 115 Z" fill="url(#zBrightTop)"/>

  <!-- Letter Z: Dynamic Diagonal Ribbon -->
  <path d="M 390 155 L 280 290 C 265 310 250 345 285 365 C 320 385 375 365 415 320 L 400 300 C 360 340 320 350 295 335 C 275 320 290 295 310 270 L 375 190 Z" fill="url(#zCyanBlue)"/>

  <!-- Letter Z: Bottom Wave Flow & Under-glow -->
  <path d="M 260 330 C 290 380 370 385 435 330 C 400 375 335 395 280 370 C 245 350 248 325 260 330 Z" fill="url(#zBottomWave)" filter="url(#glow)"/>

  <!-- Zen Leaves sprouting on right -->
  <!-- Leaf 1 (Top) -->
  <path d="M 365 245 C 385 205 440 185 450 180 C 445 210 425 250 385 260 C 375 262 368 255 365 245 Z" fill="url(#leafGrad1)"/>
  <path d="M 370 248 C 400 225 430 200 445 185" stroke="#ffffff" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.6"/>

  <!-- Leaf 2 (Middle) -->
  <path d="M 375 260 C 400 235 455 225 465 220 C 455 250 430 280 395 285 C 385 285 378 275 375 260 Z" fill="url(#leafGrad2)"/>
  <path d="M 380 263 C 410 250 440 235 460 223" stroke="#ffffff" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.6"/>

  <!-- Leaf 3 (Small Bottom) -->
  <path d="M 360 275 C 375 260 410 255 420 250 C 415 270 395 290 375 292 Z" fill="url(#leafGrad1)"/>
</svg>`;

// 2. Full Horizontal Brand Logo SVG (Navbar & Headers)
const fullLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" width="100%" height="100%">
  <defs>
    <linearGradient id="fullOrbitGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0066ff"/>
      <stop offset="60%" stop-color="#00c2ff"/>
      <stop offset="100%" stop-color="#00f0ff"/>
    </linearGradient>

    <linearGradient id="fullMDark1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0e1726"/>
      <stop offset="50%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0b1120"/>
    </linearGradient>

    <linearGradient id="fullMDark2" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="60%" stop-color="#334155"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>

    <linearGradient id="fullMGloss" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#475569"/>
      <stop offset="40%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#090d16"/>
    </linearGradient>

    <linearGradient id="fullZCyanBlue" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f0ff"/>
      <stop offset="30%" stop-color="#00b4d8"/>
      <stop offset="70%" stop-color="#0077b6"/>
      <stop offset="100%" stop-color="#023e8a"/>
    </linearGradient>

    <linearGradient id="fullZBrightTop" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0080ff"/>
      <stop offset="50%" stop-color="#00d4ff"/>
      <stop offset="100%" stop-color="#48cae4"/>
    </linearGradient>

    <linearGradient id="fullZBottomWave" x1="0%" y1="50%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f0ff"/>
      <stop offset="35%" stop-color="#0096c7"/>
      <stop offset="75%" stop-color="#0077b6"/>
      <stop offset="100%" stop-color="#03045e"/>
    </linearGradient>

    <linearGradient id="fullLeafGrad1" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0077b6"/>
      <stop offset="60%" stop-color="#00b4d8"/>
      <stop offset="100%" stop-color="#90e0ef"/>
    </linearGradient>

    <linearGradient id="fullLeafGrad2" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#023e8a"/>
      <stop offset="50%" stop-color="#0096c7"/>
      <stop offset="100%" stop-color="#48cae4"/>
    </linearGradient>

    <linearGradient id="textZenGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0052cc"/>
      <stop offset="40%" stop-color="#0080ff"/>
      <stop offset="85%" stop-color="#00d4ff"/>
      <stop offset="100%" stop-color="#00f0ff"/>
    </linearGradient>

    <linearGradient id="lineGradLeft" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0080ff" stop-opacity="0"/>
      <stop offset="70%" stop-color="#00b4d8"/>
      <stop offset="100%" stop-color="#00f0ff"/>
    </linearGradient>

    <linearGradient id="lineGradRight" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00f0ff"/>
      <stop offset="30%" stop-color="#00b4d8"/>
      <stop offset="100%" stop-color="#0080ff" stop-opacity="0"/>
    </linearGradient>

    <filter id="fullGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="5" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Group: Left Icon Emblem (scaled and positioned) -->
  <g transform="translate(-10, 0)">
    <!-- Orbital Arc -->
    <path d="M 125 240 A 130 130 0 1 1 240 55" 
          fill="none" 
          stroke="url(#fullOrbitGrad)" 
          stroke-width="12" 
          stroke-linecap="round" 
          filter="url(#fullGlow)"/>

    <!-- Letter M -->
    <path d="M 130 85 L 165 115 L 165 265 L 130 290 Z" fill="url(#fullMDark1)"/>
    <path d="M 130 85 L 170 85 L 170 265 L 130 265 Z" fill="url(#fullMGloss)" opacity="0.6"/>
    <path d="M 130 85 L 145 72 L 165 115 Z" fill="#475569"/>

    <!-- </> Code Bracket -->
    <g fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 178 80 L 169 88 L 178 96" />
      <path d="M 187 72 L 180 104" />
      <path d="M 189 80 L 198 88 L 189 96" />
    </g>

    <!-- M Center V -->
    <path d="M 165 115 L 205 185 L 220 150 L 165 115 Z" fill="url(#fullMDark2)"/>
    <path d="M 205 185 L 235 120 L 265 150 L 230 220 Z" fill="url(#fullMDark1)"/>

    <!-- Letter Z Top -->
    <path d="M 225 85 L 315 85 C 327 85 327 100 310 115 L 270 150 L 235 120 L 225 85 Z" fill="url(#fullZBrightTop)"/>

    <!-- Letter Z Diagonal Ribbon -->
    <path d="M 310 115 L 225 225 C 212 240 200 270 230 285 C 258 300 300 285 330 250 L 320 235 C 290 265 260 275 240 260 C 225 250 235 230 250 210 L 300 145 Z" fill="url(#fullZCyanBlue)"/>

    <!-- Letter Z Wave Glow -->
    <path d="M 210 255 C 235 295 300 300 350 255 C 325 290 270 308 225 290 C 200 272 200 250 210 255 Z" fill="url(#fullZBottomWave)" filter="url(#fullGlow)"/>

    <!-- Zen Leaves -->
    <path d="M 295 185 C 310 155 355 140 365 135 C 360 160 345 190 310 200 C 302 201 297 195 295 185 Z" fill="url(#fullLeafGrad1)"/>
    <path d="M 300 188 C 322 170 345 152 358 140" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0.6"/>

    <path d="M 302 200 C 322 180 365 172 375 168 C 365 192 345 218 318 220 C 310 220 304 212 302 200 Z" fill="url(#fullLeafGrad2)"/>
    <path d="M 306 202 C 330 192 355 180 370 170" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0.6"/>

    <path d="M 290 210 C 302 198 330 195 338 190 C 334 206 318 222 302 224 Z" fill="url(#fullLeafGrad1)"/>
  </g>

  <!-- Right Typography Group -->
  <g transform="translate(390, 0)">
    <!-- MAYANK ZEN Headline -->
    <text x="0" y="165" font-family="'Inter', 'Montserrat', 'Segoe UI', system-ui, sans-serif" font-weight="900" font-size="106" letter-spacing="-1">
      <tspan fill="#ffffff">MAYANK</tspan><tspan dx="15" fill="url(#textZenGrad)">ZEN</tspan>
    </text>

    <!-- STUDIO Divider Bar & Text -->
    <g transform="translate(0, 230)">
      <!-- Left decorative line -->
      <line x1="0" y1="0" x2="165" y2="0" stroke="url(#lineGradLeft)" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="178" cy="0" r="5" fill="#00f0ff" filter="url(#fullGlow)"/>

      <!-- STUDIO Text -->
      <text x="365" y="10" text-anchor="middle" font-family="'Inter', 'Segoe UI', system-ui, sans-serif" font-weight="700" font-size="34" fill="#ffffff" letter-spacing="18">STUDIO</text>

      <!-- Right decorative line -->
      <circle cx="552" cy="0" r="5" fill="#00f0ff" filter="url(#fullGlow)"/>
      <line x1="565" y1="0" x2="730" y2="0" stroke="url(#lineGradRight)" stroke-width="3.5" stroke-linecap="round"/>
    </g>

    <!-- Subtitle: WEBSITES • APPS • IDEAS • SOLUTIONS -->
    <text x="365" y="305" text-anchor="middle" font-family="'Inter', 'Segoe UI', system-ui, sans-serif" font-weight="600" font-size="21" fill="#94a3b8" letter-spacing="7">
      WEBSITES <tspan fill="#00d4ff" font-size="24">•</tspan> APPS <tspan fill="#00d4ff" font-size="24">•</tspan> IDEAS <tspan fill="#00d4ff" font-size="24">•</tspan> SOLUTIONS
    </text>
  </g>
</svg>`;

// Write vector files
fs.writeFileSync('./favicon.svg', faviconSvg, 'utf8');
fs.writeFileSync('./logo-icon.svg', faviconSvg, 'utf8');
fs.writeFileSync('./logo.svg', fullLogoSvg, 'utf8');

// Generate raster icons using sharp
async function generateRasters() {
  const faviconBuffer = Buffer.from(faviconSvg);
  const fullLogoBuffer = Buffer.from(fullLogoSvg);

  // 1. icon.png (512x512 with dark rounded/padded canvas)
  await sharp(faviconBuffer)
    .resize(512, 512)
    .png()
    .toFile('./icon.png');

  // 2. apple-touch-icon.png (180x180)
  await sharp(faviconBuffer)
    .resize(180, 180)
    .png()
    .toFile('./apple-touch-icon.png');

  // 3. favicon-32x32.png
  await sharp(faviconBuffer)
    .resize(32, 32)
    .png()
    .toFile('./favicon-32x32.png');

  // 4. favicon-16x16.png
  await sharp(faviconBuffer)
    .resize(16, 16)
    .png()
    .toFile('./favicon-16x16.png');

  // 5. favicon.ico (Sharp PNG format standardly accepted as ico or 32x32)
  await sharp(faviconBuffer)
    .resize(48, 48)
    .png()
    .toFile('./favicon.ico');

  // 6. logo.png (1200x400 high resolution)
  await sharp(fullLogoBuffer)
    .resize(1200, 400)
    .png()
    .toFile('./logo.png');

  // 7. site.webmanifest
  const webManifest = {
    name: "MayankZen Studios",
    short_name: "MayankZen",
    icons: [
      { src: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { src: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/icon.png", sizes: "512x512", type: "image/png" }
    ],
    theme_color: "#0a0e17",
    background_color: "#0a0e17",
    display: "standalone",
    start_url: "/"
  };
  fs.writeFileSync('./site.webmanifest', JSON.stringify(webManifest, null, 2), 'utf8');

  console.log("All vector and raster logo assets generated successfully in workspace!");
}

generateRasters().catch(err => {
  console.error("Error generating rasters:", err);
  process.exit(1);
});
