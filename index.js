// index.js
const fs = require('node:fs');
const path = require('node:path');
const { 
    Client, Collection, GatewayIntentBits, Events, EmbedBuilder, 
    ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, 
    TextInputStyle, ChannelType, PermissionsBitField, ButtonBuilder, 
    ButtonStyle, Colors, AttachmentBuilder 
} = require('discord.js');
const discordTranscripts = require('discord-html-transcripts');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// لود کردن دستورات
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// رویداد ready
client.once(Events.ClientReady, readyClient => {
    console.log(`✅ آماده شد! به عنوان ${readyClient.user.tag} لاگین شدم.`);
});


// تابع کمکی برسی رول ادمین
function isSupportAdmin(interaction) {
    const adminRoleId = process.env.ADMIN_ROLE_ID;
    if (!adminRoleId) {
        console.error('ADMIN_ROLE_ID is not set in .env');
        return false;
    }
    // چک می‌کنه که کاربر اون رول رو داره یا نه
    return interaction.member.roles.cache.has(adminRoleId);
}


// شنوده تعاملات
client.on(Events.InteractionCreate, async interaction => {

    // اسلش کامند
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
        return;
    }

    // منوی کشویی
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'create_ticket_menu') {
            const selectedValue = interaction.values[0];
            if (selectedValue === 'other') {
                const modal = new ModalBuilder()
                    .setCustomId('other_reason_modal')
                    .setTitle('دلیل ساخت تیکت');
                const reasonInput = new TextInputBuilder()
                    .setCustomId('ticket_reason_input')
                    .setLabel('لطفا دلیل خود را به طور خلاصه بنویسید:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
                await interaction.showModal(modal);
            } else {
                await interaction.deferReply({ ephemeral: true });
                await createTicketChannel(interaction, selectedValue);
            }
        }
        return;
    }

    // مدال ساخت فرم غیره
    if (interaction.isModalSubmit()) {
        // مدال برای دلیل "غیره"
        if (interaction.customId === 'other_reason_modal') {
            await interaction.deferReply({ ephemeral: true });
            const reason = interaction.fields.getTextInputValue('ticket_reason_input');
            await createTicketChannel(interaction, 'other', reason);
        }

        // مدال برای "Add User"
        if (interaction.customId === 'ticket_add_user_modal') {
            if (!isSupportAdmin(interaction)) {
                return interaction.reply({ content: 'شما اجازه انجام این کار را ندارید.', ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: true });
            const userId = interaction.fields.getTextInputValue('user_id_input');
            const member = await interaction.guild.members.fetch(userId).catch(() => null);

            if (!member) {
                return interaction.editReply({ content: 'کاربر با این آیدی در سرور یافت نشد.' });
            }

            try {
                await interaction.channel.permissionOverwrites.edit(member.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true
                });
                await interaction.editReply({ content: `${member} با موفقیت به تیکت اضافه شد.` });
                await interaction.channel.send({
                    embeds: [new EmbedBuilder().setColor(Colors.Blue).setDescription(`👤 ${member} توسط ${interaction.user} به تیکت اضافه شد.`)]
                });
            } catch (error) {
                console.error('Error adding user:', error);
                await interaction.editReply({ content: 'خطایی در اضافه کردن کاربر رخ داد.' });
            }
        }
        
        // مدال برای "Remove User"
        if (interaction.customId === 'ticket_remove_user_modal') {
             if (!isSupportAdmin(interaction)) {
                return interaction.reply({ content: 'شما اجازه انجام این کار را ندارید.', ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: true });
            const userId = interaction.fields.getTextInputValue('user_id_input');
            const member = await interaction.guild.members.fetch(userId).catch(() => null);

            if (!member) {
                return interaction.editReply({ content: 'کاربر با این آیدی در سرور یافت نشد.' });
            }

            // چک کردن که کاربر سازنده تیکت رو حذف نکنه
            const topic = interaction.channel.topic;
            if (topic && topic.includes(member.id)) {
                 return interaction.editReply({ content: 'شما نمی‌توانید سازنده اصلی تیکت را حذف کنید.' });
            }

            try {
                await interaction.channel.permissionOverwrites.delete(member.id);
                await interaction.editReply({ content: `${member} با موفقیت از تیکت حذف شد.` });
                await interaction.channel.send({
                    embeds: [new EmbedBuilder().setColor(Colors.Orange).setDescription(`👤 ${member} توسط ${interaction.user} از تیکت حذف شد.`)]
                });
            } catch (error) {
                console.error('Error removing user:', error);
                await interaction.editReply({ content: 'خطایی در حذف کردن کاربر رخ داد.' });
            }
        }
        return;
    }

    // مدیریت دکمه‌ها (Button) 
    if (interaction.isButton()) {
        const customId = interaction.customId;

        if (customId !== 'ticket_transcript' && !isSupportAdmin(interaction)) {
             return interaction.reply({ content: 'شما اجازه استفاده از این دکمه را ندارید.', ephemeral: true });
        }

        // کلیم تیکت
        if (customId === 'ticket_claim') {
            await interaction.deferUpdate(); 

            const originalEmbed = interaction.message.embeds[0];
            const updatedEmbed = EmbedBuilder.from(originalEmbed)
                .addFields({ name: 'Claimed by', value: `${interaction.user}`, inline: true })
                .setColor(Colors.Yellow); 
            // غیر فعال کردن کلیم
            const components = interaction.message.components[0].components.map(comp => {
                if (comp.customId === 'ticket_claim') {
                    return ButtonBuilder.from(comp).setDisabled(true);
                }
                return ButtonBuilder.from(comp);
            });
            const updatedRow = new ActionRowBuilder().addComponents(components);

            await interaction.editReply({ embeds: [updatedEmbed], components: [updatedRow] });
            await interaction.channel.send({
                embeds: [new EmbedBuilder().setColor(Colors.Yellow).setDescription(`✋ این تیکت توسط ${interaction.user} کلیم شد.`)]
            });
        }

        // نمایش تایید بستن
        if (customId === 'ticket_close') {
            const confirmEmbed = new EmbedBuilder()
                .setTitle('❓ تایید بستن تیکت')
                .setDescription('آیا مطمئن هستید که می‌خواهید این تیکت را ببندید؟')
                .setColor(Colors.Red);
            
            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_close_confirm')
                    .setLabel('بله، ببند')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('✔️'),
                new ButtonBuilder()
                    .setCustomId('ticket_close_cancel')
                    .setLabel('انصراف')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('✖️')
            );
            
            // این پیام رو فقط خود ادمین می‌بینه (ephemeral)
            await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: true });
        }

        // انصراف
        if (customId === 'ticket_close_cancel') {
            // پاک کردن پیام
            await interaction.message.delete();
        }

        // تایید برای بسته شدن
        if (customId === 'ticket_close_confirm') {
            await interaction.deferUpdate();

            await interaction.message.delete();
            
            // لاک کردن چنل
            const topic = interaction.channel.topic;
            const userIdMatch = topic ? topic.match(/ID: (\d+)/) : null;
            const userId = userIdMatch ? userIdMatch[1] : null;

            if (userId) {
                const ticketOwner = await interaction.guild.members.fetch(userId).catch(() => null);
                if (ticketOwner) {
                    await interaction.channel.permissionOverwrites.edit(ticketOwner.id, {
                        SendMessages: false // نمیشه مسیج داد
                    });
                }
            }

            // تغییر نام چنل
            await interaction.channel.setName(`closed-${interaction.channel.name.replace('ticket-', '')}`);

            // اپدیت امبد اصلی
            const originalEmbed = interaction.message.embeds[0];
            const closedEmbed = EmbedBuilder.from(originalEmbed)
                .setTitle(`🔒 تیکت بسته شد (توسط ${interaction.user.username})`)
                .setColor(Colors.DarkGrey);

            // دکمه‌های جدید (حذف، بازکردن، ترنسکریپت)
            const closedRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_delete') // این همون "remove" هست که خواسته بودی
                    .setLabel('Delete Ticket')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🗑️'),
                new ButtonBuilder()
                    .setCustomId('ticket_reopen')
                    .setLabel('Re-open')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🔓'),
                new ButtonBuilder()
                    .setCustomId('ticket_transcript') // ترنسکریپت اینجا هم باشه خوبه
                    .setLabel('Transcript')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📄')
            );
            
            await interaction.editReply({ embeds: [closedEmbed], components: [closedRow] });
            await interaction.channel.send({
                embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(`🔒 این تیکت توسط ${interaction.user} بسته شد.`)]
            });
        }

        // --- دکمه بازگشایی تیکت ---
        if (customId === 'ticket_reopen') {
            await interaction.deferUpdate();

            // باز کردن چنل برای سازنده تیکت
            const topic = interaction.channel.topic;
            const userIdMatch = topic ? topic.match(/ID: (\d+)/) : null;
            const userId = userIdMatch ? userIdMatch[1] : null;

            if (userId) {
                const ticketOwner = await interaction.guild.members.fetch(userId).catch(() => null);
                if (ticketOwner) {
                    await interaction.channel.permissionOverwrites.edit(ticketOwner.id, {
                        SendMessages: true // دوباره می‌تونه پیام بده
                    });
                }
            }
            
            // تغییر نام چنل
            await interaction.channel.setName(`ticket-${interaction.channel.name.replace('closed-', '')}`);

            const originalEmbed = interaction.message.embeds[0];
            const reopenedEmbed = EmbedBuilder.from(originalEmbed)
                .setTitle(originalEmbed.title.replace('🔒 تیکت بسته شد', '🎫 تیکت'))
                .setColor(Colors.Green); 

            const originalRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setStyle(ButtonStyle.Primary).setEmoji('✋'),
                new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
                new ButtonBuilder().setCustomId('ticket_add_user').setLabel('Add').setStyle(ButtonStyle.Secondary).setEmoji('➕'),
                new ButtonBuilder().setCustomId('ticket_remove_user').setLabel('Remove').setStyle(ButtonStyle.Secondary).setEmoji('➖'),
                new ButtonBuilder().setCustomId('ticket_transcript').setLabel('Transcript').setStyle(ButtonStyle.Success).setEmoji('📄')
            );

            await interaction.editReply({ embeds: [reopenedEmbed], components: [originalRow] });
            await interaction.channel.send({
                embeds: [new EmbedBuilder().setColor(Colors.Green).setDescription(`🔓 این تیکت توسط ${interaction.user} بازگشایی شد.`)]
            });
        }

        // --- دکمه حذف تیکت ---
        if (customId === 'ticket_delete') {
            await interaction.deferUpdate();
            await interaction.channel.send({
                embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription('🗑️ چنل تا ۵ ثانیه دیگر حذف خواهد شد...')]
            });
            setTimeout(async () => {
                await interaction.channel.delete();
            }, 5000);
        }

        // --- دکمه Add User ---
        if (customId === 'ticket_add_user') {
            const modal = new ModalBuilder()
                .setCustomId('ticket_add_user_modal')
                .setTitle('افزودن کاربر به تیکت');
            const userIdInput = new TextInputBuilder()
                .setCustomId('user_id_input')
                .setLabel('آیدی (ID) کاربر مورد نظر را وارد کنید:')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(userIdInput));
            await interaction.showModal(modal);
        }

        // --- دکمه Remove User  ---
        if (customId === 'ticket_remove_user') {
            const modal = new ModalBuilder()
                .setCustomId('ticket_remove_user_modal')
                .setTitle('حذف کاربر از تیکت');
            const userIdInput = new TextInputBuilder()
                .setCustomId('user_id_input')
                .setLabel('آیدی (ID) کاربر مورد نظر را وارد کنید:')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(userIdInput));
            await interaction.showModal(modal);
        }

        // --- دکمه Transcript ---
        if (customId === 'ticket_transcript') {
            const topic = interaction.channel.topic;
            const userIdMatch = topic ? topic.match(/ID: (\d+)/) : null;
            const isOwner = userIdMatch ? userIdMatch[1] === interaction.user.id : false;

            if (!isSupportAdmin(interaction) && !isOwner) {
                return interaction.reply({ content: 'شما اجازه گرفتن ترنسکریپت را ندارید.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                const attachment = await discordTranscripts.createTranscript(interaction.channel, {
                    limit: -1, // بدون محدودیت تعداد پیام
                    returnType: 'attachment', // خروجی به صورت فایل
                    filename: `transcript-${interaction.channel.name}.html`,
                    saveImages: true, // ذخیره عکس‌ها
                    poweredBy: false // حذف "Powered by discord-html-transcripts"
                });

                const transcriptEmbed = new EmbedBuilder()
                    .setTitle('📄 ترنسکریپت تیکت')
                    .setDescription(`فایل ترنسکریپت برای چنل ${interaction.channel} آماده شد.`)
                    .setColor(Colors.Blue);

                await interaction.editReply({ 
                    embeds: [transcriptEmbed], 
                    files: [attachment] 
                });

            } catch (error) {
                console.error('Error creating transcript:', error);
                await interaction.editReply({ content: 'خطایی هنگام ساخت ترنسکریپت رخ داد.' });
            }
        }
    }
});


// تابع ساخت تیکت چنل
async function createTicketChannel(interaction, type, reason = null) {
    const guild = interaction.guild;
    const user = interaction.user;
    
    const adminRoleId = process.env.ADMIN_ROLE_ID;
    const categoryId = process.env.TICKET_CATEGORY_ID;

    if (!adminRoleId || !categoryId) {
        console.error('Error: ADMIN_ROLE_ID or TICKET_CATEGORY_ID is not set in .env file.');
        await interaction.editReply({ content: 'خطای سیستمی: ربات به درستی پیکربندی نشده است.' });
        return;
    }

    // تیکت لیمیت هست؟
    const ticketLimit = 2;
    const category = guild.channels.cache.get(categoryId);
    if (!category || category.type !== ChannelType.GuildCategory) {
        await interaction.editReply({ content: 'خطای سیستمی: دسته‌بندی تیکت‌ها یافت نشد.' });
        return;
    }
    const userTicketChannels = category.children.cache.filter(ch => 
        ch.type === ChannelType.GuildText && ch.topic && ch.topic.includes(`ID: ${user.id}`)
    );
    if (userTicketChannels.size >= ticketLimit) {
        const limitEmbed = new EmbedBuilder()
            .setTitle('❌ خطا در ساخت تیکت')
            .setDescription(`شما در حال حاضر ${userTicketChannels.size} تیکت باز دارید و نمی‌توانید بیش از ${ticketLimit} تیکت باز داشته باشید.\n\nلطفا ابتدا تیکت‌های قبلی خود را ببندید:\n${userTicketChannels.map(ch => `${ch}`).join('\n')}`)
            .setColor(Colors.Red);
        await interaction.editReply({ embeds: [limitEmbed], ephemeral: true });
        return;
    }

    // ساختن چنل جدید
    try {
        const channel = await guild.channels.create({
            name: `ticket-${type}-${user.username}`,
            type: ChannelType.GuildText,
            parent: categoryId,
            topic: `Ticket for ${user.tag} (ID: ${user.id}). Type: ${type}.`, //  برای شناسایی
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles] },
                { id: adminRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles] },
                { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] }
            ],
        });

        const ticketEmbed = new EmbedBuilder()
            .setTitle(`🎫 تیکت ${type}`)
            .setDescription(`سلام ${user}! به تیکت خود خوش آمدید.\nلطفا منتظر پاسخگویی ادمین باشید.`)
            .setColor(Colors.Green)
            .addFields(
                { name: '👤 سازنده', value: `${user}`, inline: true },
                { name: '📌 نوع', value: `\`${type}\``, inline: true }
            )
            .setTimestamp();
        if (reason) {
            ticketEmbed.addFields({ name: '📝 دلیل (غیره)', value: reason });
        }

//  ساخت دکمه ها
        const claimButton = new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setStyle(ButtonStyle.Primary).setEmoji('✋');
        const closeButton = new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒');
        const addButton = new ButtonBuilder().setCustomId('ticket_add_user').setLabel('Add').setStyle(ButtonStyle.Secondary).setEmoji('➕');
        const removeButton = new ButtonBuilder().setCustomId('ticket_remove_user').setLabel('Remove').setStyle(ButtonStyle.Secondary).setEmoji('➖');
        const transcriptButton = new ButtonBuilder().setCustomId('ticket_transcript').setLabel('Transcript').setStyle(ButtonStyle.Success).setEmoji('📄');
        const controlRow = new ActionRowBuilder().addComponents(claimButton, closeButton, addButton, removeButton, transcriptButton);

        await channel.send({
            content: `${user} <@&${adminRoleId}>`,
            embeds: [ticketEmbed],
            components: [controlRow]
        });

        await interaction.editReply({ content: `تیکت شما با موفقیت در چنل ${channel} ایجاد شد.` });

    } catch (error) {
        console.error('Error creating ticket channel:', error);
        await interaction.editReply({ content: 'خطایی هنگام ساخت چنل تیکت رخ داد.' });
    }
}


// لاگین کردن ربات
client.login(process.env.DISCORD_TOKEN);