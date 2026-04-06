import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { getChallengerLeague } from './apps/backend/src/services/riot';

async function test() {
    try {
        const data = await getChallengerLeague('euw1');
        console.log('League Name:', data.name);
        console.log('Entry 0:', JSON.stringify(data.entries[0], null, 2));
        console.log('Entry 1:', JSON.stringify(data.entries[1], null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
