
require('dotenv').config();

const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('تأكد من وجود DISCORD_TOKEN و CLIENT_ID و GUILD_ID في ملف .env');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('beginoutsidethegame')
    .setDescription('ابدأ لعبة برا السالفة'),

  new SlashCommandBuilder()
    .setName('outsideleaderboard')
    .setDescription('اعرض لوحة المتصدرين'),

  new SlashCommandBuilder()
    .setName('outsidehelp')
    .setDescription('شرح طريقة لعب برا السالفة')
].map(command => command.toJSON());

async function main() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log('تم تسجيل أوامر البوت بنجاح!');
}

main().catch(error => {
  console.error('فشل تسجيل الأوامر:', error.message);
  process.exit(1);
});
