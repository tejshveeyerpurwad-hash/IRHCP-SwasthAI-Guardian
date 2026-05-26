/**
 * SwasthAI Demo Seed Script
 * Creates 3 known working demo accounts for hackathon evaluation.
 * 
 * Run: node seed.js
 * 
 * Accounts created:
 *   Villager: phone=9876543210, password=Demo@1234, role=villager
 *   NGO/ASHA: phone=9876543211, password=Demo@1234, role=ngo
 *   Admin:    email=admin@swasthai.in, password=Demo@1234, role=admin
 */

import sqlite3pkg from 'sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const sqlite3 = sqlite3pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = path.resolve(__dirname, 'swasth_guardian.sqlite');
const db = new sqlite3.Database(DB_PATH);

const DEMO_PASSWORD = 'Demo@1234';

async function seed() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const accounts = [
    { phone: '9876543210', email: 'villager@swasthai.in', username: 'demo_villager', name: 'Ramesh Kumar', role: 'villager', villageId: 'v101' },
    { phone: '9876543211', email: 'asha@swasthai.in',    username: 'demo_asha',     name: 'Sita Devi (ASHA)', role: 'ngo',      villageId: 'v101' },
    { phone: '9876543212', email: 'admin@swasthai.in',   username: 'demo_admin',    name: 'CMO Varanasi',     role: 'admin',    villageId: null   },
  ];

  for (const acc of accounts) {
    await new Promise((resolve) => {
      // Delete existing demo account with this phone or email first
      db.run(
        'DELETE FROM users WHERE phone = ? OR email = ?',
        [acc.phone, acc.email],
        () => {
          db.run(
            'INSERT INTO users (phone, email, username, name, password, role, villageId) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [acc.phone, acc.email, acc.username, acc.name, hash, acc.role, acc.villageId],
            function(err) {
              if (err) console.error(`❌ Failed to seed ${acc.role}:`, err.message);
              else console.log(`✅ Seeded ${acc.role}: ${acc.name} (phone: ${acc.phone})`);
              resolve();
            }
          );
        }
      );
    });
  }

  db.close(() => {
    console.log('\n🎉 Demo accounts ready!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Role     │ Phone/Email          │ Password  ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Villager │ 9876543210           │ Demo@1234');
    console.log('  NGO/ASHA │ 9876543211           │ Demo@1234');
    console.log('  Admin    │ admin@swasthai.in     │ Demo@1234');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  OTP Login: Use OTP = 1234 for any account');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  });
}

seed().catch(console.error);
