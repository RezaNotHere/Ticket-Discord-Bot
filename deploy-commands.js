// deploy-commands.js
const { REST, Routes } = require('discord.js');
const { clientId, guildId } = require('./config-loader'); 
const fs = require('node:fs');
const path = require('node:path');
// برای لود .env
require('dotenv').config(); 

const commands = [];
// فایل‌های دستورات رو از پوشه کامند لود می‌کنه
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// ساختن یه نمونه از REST
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// دپلوی کردن دستورات
(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        const data = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error(error);
    }
})();