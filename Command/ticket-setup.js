//ticket-setup.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionsBitField, ChannelType, Colors } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket-setup')
        .setDescription('پیام ساخت تیکت را در این چنل ارسال می‌کند.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator) // فقط ادمین‌ بتونن اجرا کنه
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('چنلی که پیام ساخت تیکت در آن ارسال شود.')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)),
    
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');

        // ساخت امبد اصلی
        const setupEmbed = new EmbedBuilder()
            .setTitle('🎫 مرکز پشتیبانی')
            .setDescription('سلام! 👋\nبرای ایجاد تیکت و دریافت پشتیبانی، لطفا یکی از گزینه‌های زیر را انتخاب کنید.')
            .setColor(Colors.Blue) 
            .setFooter({ text: `${interaction.guild.name} Support System` });
            const serverIcon = interaction.guild.iconURL({ dynamic: true, size: 512 });
             if (serverIcon) {
                setupEmbed.setThumbnail(serverIcon);
            }
        // ساخت منو
            const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('create_ticket_menu')
            .setPlaceholder('دلیل ساخت تیکت را انتخاب کنید...')
            .addOptions([
                {
                    label: '🛒 خرید',
                    description: 'برای سوالات مربوط به خرید و پرداخت',
                    value: 'purchase',
                    emoji: '🛒'
                },
                {
                    label: '🐛 گزارش مشکل',
                    description: 'گزارش باگ، مشکل فنی یا خطای ربات',
                    value: 'report',
                    emoji: '🐛'
                },
                {
                    label: '🎁 دریافت جایزه',
                    description: 'برای دریافت جوایز ایونت‌ها و گیووای',
                    value: 'prize',
                    emoji: '🎁'
                },
                {
                    label: '❓ غیره',
                    description: 'سایر موارد که در دسته‌بندی‌ها نیست',
                    value: 'other',
                    emoji: '❓'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        try {
            await channel.send({ embeds: [setupEmbed], components: [row] });
            
            await interaction.reply({ content: `پیام ساخت تیکت با موفقیت در چنل ${channel} ارسال شد.`, ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'هنگام ارسال پیام خطایی رخ داد.', ephemeral: true });
        }
    },
};