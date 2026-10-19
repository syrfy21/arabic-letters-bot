
require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags
} = require('discord.js');

const fs = require('node:fs');
const path = require('node:path');

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error('خطأ: لم يتم العثور على DISCORD_TOKEN في ملف .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 20;
const VOTE_SECONDS = 45;

const SCORE_CORRECT_VOTE = 2;
const SCORE_OUTSIDER_ESCAPED = 3;

const DATA_FILE = path.join(__dirname, 'outsideLeaderboard.json');
const games = new Map();

const TOPICS = {
  'ألعاب فيديو': [
    'ببجي', 'ماينكرافت', 'فورتنايت', 'روبلوكس',
    'فيفا', 'GTA', 'كول أوف ديوتي', 'روكيت ليغ',
    'فالورانت', 'ليغ أوف ليجندز'
  ],
  'أكلات': [
    'منسف', 'مقلوبة', 'مسخّن', 'مجدّرة',
    'بيتزا', 'برغر', 'شاورما', 'كنافة',
    'فلافل', 'حمص'
  ],
  'حيوانات': [
    'أسد', 'فيل', 'زرافة', 'قط', 'كلب',
    'حصان', 'دب', 'ذئب', 'ثعلب', 'أرنب'
  ],
  'بلدان ومدن': [
    'فلسطين', 'الأردن', 'مصر', 'اليابان',
    'تركيا', 'نابلس', 'القدس', 'باريس',
    'لندن', 'روما'
  ],
  'أشياء يومية': [
    'هاتف', 'حاسوب', 'مفتاح', 'كرسي',
    'ساعة', 'حقيبة', 'مروحة', 'تلفاز',
    'قلم', 'مظلة'
  ],
  'رياضة': [
    'كرة القدم', 'كرة السلة', 'التنس',
    'السباحة', 'الملاكمة', 'كرة الطائرة',
    'الجري', 'ركوب الدراجات'
  ],
  'شخصيات خيالية': [
    'سبايدرمان', 'باتمان', 'سوبرمان',
    'هاري بوتر', 'سبونج بوب', 'شريك',
    'ناروتو', 'غوكو', 'توم وجيري', 'ميكي ماوس'
  ],
  'أماكن': [
    'مدرسة', 'مستشفى', 'مطار', 'شاطئ',
    'مطعم', 'جامعة', 'مكتبة', 'ملعب',
    'سوق', 'سينما'
  ]
};

function loadLeaderboard() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('تعذرت قراءة لوحة المتصدرين:', error.message);
  }

  return {};
}

let leaderboard = loadLeaderboard();

function saveLeaderboard() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(leaderboard, null, 2),
      'utf8'
    );
  } catch (error) {
    console.error('تعذّر حفظ لوحة المتصدرين:', error.message);
  }
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function playerIds(game) {
  return [...game.players];
}

function mention(id) {
  return `<@${id}>`;
}

function ensurePlayer(id) {
  if (!leaderboard[id]) {
    leaderboard[id] = {
      points: 0,
      wins: 0,
      games: 0,
      outsiderWins: 0
    };
  }
}

function makeEmbed(title, description, color = 0x7c3aed) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'GamesBrothers • برا السالفة' });
}

function lobbyButtons(guildId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`outside_join:${guildId}`)
      .setLabel('انضم للعبة')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`outside_start:${guildId}`)
      .setLabel('ابدأ اللعبة')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`outside_cancel:${guildId}`)
      .setLabel('إلغاء اللعبة')
      .setStyle(ButtonStyle.Danger)
  );
}

function discussionButtons(guildId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`outside_voteopen:${guildId}`)
      .setLabel('إنهاء النقاش وبدء التصويت')
      .setStyle(ButtonStyle.Primary)
  );
}

function votingButtons(game, guildId) {
  const ids = playerIds(game);
  const rows = [];

  for (let i = 0; i < ids.length; i += 5) {
    const row = new ActionRowBuilder();

    for (const id of ids.slice(i, i + 5)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`outside_vote:${guildId}:${id}`)
          .setLabel(game.displayNames[id].slice(0, 80))
          .setStyle(ButtonStyle.Secondary)
      );
    }

    rows.push(row);
  }

  return rows;
}

async function sendPrivateRole(guild, id, game) {
  const member = await guild.members.fetch(id).catch(() => null);

  if (!member) return false;

  const isOutsider = id === game.outsiderId;

  const embed = makeEmbed(
    isOutsider ? '🤫 أنت برا السالفة!' : '🟢 أنت داخل السالفة',
    isOutsider
      ? 'أنت لا تعرف الموضوع السري. شارك في النقاش وحاول اكتشاف الموضوع دون أن ينكشف أمرك.'
      : `الموضوع السري هو:\n\n# ${game.topic}\n\nناقش بقية اللاعبين دون كشف الموضوع بشكل مباشر.`,
    isOutsider ? 0xef4444 : 0x22c55e
  );

  embed.setFooter({
    text: 'رسالة سرية — لا تشاركها مع اللاعبين الآخرين!'
  });

  try {
    await member.send({ embeds: [embed] });
    return true;
  } catch {
    return false;
  }
}

async function startGame(guild, game, channel) {
  if (game.phase !== 'lobby') {
    return 'اللعبة بدأت بالفعل.';
  }

  if (game.players.size < MIN_PLAYERS) {
    return `تحتاج إلى ${MIN_PLAYERS} لاعبين على الأقل. عدد اللاعبين الحالي: ${game.players.size}.`;
  }

  game.phase = 'starting';
  game.category = randomItem(Object.keys(TOPICS));
  game.topic = randomItem(TOPICS[game.category]);
  game.outsiderId = randomItem(playerIds(game));
  game.votes = new Map();

  const failed = [];

  for (const id of playerIds(game)) {
    const success = await sendPrivateRole(guild, id, game);

    if (!success) failed.push(id);
  }

  if (failed.length > 0) {
    game.phase = 'lobby';
    game.topic = null;
    game.category = null;
    game.outsiderId = null;

    return (
      'لم أستطع إرسال الرسائل الخاصة إلى اللاعبين التاليين:\n' +
      failed.map(mention).join('، ') +
      '\n\nاطلب منهم السماح بالرسائل الخاصة من أعضاء السيرفر، ثم أعد المحاولة.'
    );
  }

  game.phase = 'discussion';

  await channel.send({
    embeds: [
      makeEmbed(
        '🎭 بدأت لعبة برا السالفة!',
        'تم إرسال الأدوار برسائل خاصة.\n\n' +
        'ابدؤوا النقاش وحاولوا اكتشاف من لا يعرف الموضوع.\n' +
        'عندما تنتهون، يضغط منظّم اللعبة زر بدء التصويت.'
      )
    ],
    components: [discussionButtons(guild.id)]
  });

  return null;
}

async function startVoting(guildId, channel) {
  const game = games.get(guildId);

  if (!game || game.phase !== 'discussion') return;

  game.phase = 'voting';
  game.votes = new Map();

  await channel.send({
    embeds: [
      makeEmbed(
        '🗳️ بدأ التصويت!',
        `اختر اللاعب الذي تعتقد أنه برا السالفة.\nمدة التصويت: ${VOTE_SECONDS} ثانية.\nلكل لاعب صوت واحد.`
      )
    ],
    components: votingButtons(game, guildId)
  });

  game.voteTimer = setTimeout(() => {
    finishVoting(guildId, channel).catch(console.error);
  }, VOTE_SECONDS * 1000);
}

async function finishVoting(guildId, channel) {
  const game = games.get(guildId);

  if (!game || game.phase !== 'voting') return;

  clearTimeout(game.voteTimer);
  game.phase = 'ended';

  const counts = new Map();

  for (const targetId of game.votes.values()) {
    counts.set(targetId, (counts.get(targetId) || 0) + 1);
  }

  const highest = counts.size
    ? Math.max(...counts.values())
    : 0;

  const leaders = [...counts.entries()]
    .filter(([, count]) => count === highest)
    .map(([id]) => id);

  const tie = leaders.length !== 1;
  const caught = !tie && leaders[0] === game.outsiderId;

  for (const id of playerIds(game)) {
    ensurePlayer(id);

    const score = leaderboard[id];
    const isOutsider = id === game.outsiderId;

    let points = 0;
    let won = false;

    if (isOutsider && !caught) {
      points = SCORE_OUTSIDER_ESCAPED;
      won = true;
      score.outsiderWins += 1;
    } else if (!isOutsider && game.votes.get(id) === game.outsiderId) {
      points = SCORE_CORRECT_VOTE;
      won = caught;
    }

    score.points += points;
    score.games += 1;

    if (won) score.wins += 1;
  }

  saveLeaderboard();

  const voteDetails = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => `${mention(id)} — ${count} صوت`)
    .join('\n') || 'لم يصوّت أحد.';

  const pointsDetails = playerIds(game)
    .map(id => {
      let points = 0;

      if (id === game.outsiderId && !caught) {
        points = SCORE_OUTSIDER_ESCAPED;
      } else if (
        id !== game.outsiderId &&
        game.votes.get(id) === game.outsiderId
      ) {
        points = SCORE_CORRECT_VOTE;
      }

      return `${mention(id)}: +${points} نقطة`;
    })
    .join('\n');

  const result = [
    `**الموضوع السري:** ${game.topic}`,
    `**الفئة:** ${game.category}`,
    `**اللاعب الذي كان برا السالفة:** ${mention(game.outsiderId)}`,
    '',
    tie
      ? '**النتيجة:** تعادل في الأصوات، ولم يتم كشف اللاعب.'
      : caught
        ? '**النتيجة:** تم كشف اللاعب برا السالفة!'
        : '**النتيجة:** نجح اللاعب برا السالفة في الهروب!',
    '',
    '**نتائج التصويت:**',
    voteDetails,
    '',
    '**نقاط الجولة:**',
    pointsDetails
  ].join('\n');

  await channel.send({
    embeds: [
      makeEmbed(
        '🏁 انتهت الجولة!',
        result,
        caught ? 0x22c55e : 0xf59e0b
      )
    ]
  });

  games.delete(guildId);
}

client.once('ready', () => {
  console.log(`البوت يعمل الآن باسم ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (!interaction.guild || !interaction.guildId) {
        return interaction.reply({
          content: 'هذا الأمر يعمل داخل سيرفر Discord فقط.',
          flags: MessageFlags.Ephemeral
        });
      }

      const guildId = interaction.guildId;

      if (interaction.commandName === 'beginoutsidethegame') {
        const current = games.get(guildId);

        if (current) {
          return interaction.reply({
            content: 'هناك لعبة قائمة بالفعل في هذا السيرفر.',
            flags: MessageFlags.Ephemeral
          });
        }

        const game = {
          hostId: interaction.user.id,
          phase: 'lobby',
          players: new Set([interaction.user.id]),
          displayNames: {
            [interaction.user.id]:
              interaction.member?.displayName || interaction.user.username
          },
          topic: null,
          category: null,
          outsiderId: null,
          votes: new Map(),
          voteTimer: null
        };

        games.set(guildId, game);

        return interaction.reply({
          embeds: [
            makeEmbed(
              '🎭 لعبة برا السالفة',
              `بدأ ${interaction.user} غرفة اللعبة!\n\n` +
              'اضغط «انضم للعبة» حتى تشارك.\n\n' +
              `الحد الأدنى: ${MIN_PLAYERS} لاعبين\n` +
              `الحد الأقصى: ${MAX_PLAYERS} لاعبًا\n\n` +
              'عندما يصبح الجميع جاهزًا، يضغط المنظّم «ابدأ اللعبة».'
            )
          ],
          components: [lobbyButtons(guildId)]
        });
      }

      if (interaction.commandName === 'outsideleaderboard') {
        const entries = Object.entries(leaderboard)
          .sort((a, b) => b[1].points - a[1].points)
          .slice(0, 10);

        const description = entries.length
          ? entries.map(([id, score], index) =>
              `**${index + 1}.** ${mention(id)} — ${score.points} نقطة | ` +
              `مرات الفوز: ${score.wins} | ` +
              `مرات اللعب: ${score.games}`
            ).join('\n')
          : 'لا توجد نتائج محفوظة حتى الآن.';

        return interaction.reply({
          embeds: [
            makeEmbed('🏆 لوحة متصدري برا السالفة', description)
          ]
        });
      }

      if (interaction.commandName === 'outsidehelp') {
        return interaction.reply({
          embeds: [
            makeEmbed(
              '📘 طريقة اللعب',
              '1. استخدم `/beginoutsidethegame` لفتح غرفة.\n' +
              `2. اجمع ${MIN_PLAYERS} لاعبين على الأقل.\n` +
              '3. يحصل معظم اللاعبين على الموضوع السري برسالة خاصة.\n' +
              '4. لاعب واحد فقط يكون برا السالفة ولا يعرف الموضوع.\n' +
              '5. ناقشوا الموضوع دون كشفه مباشرة.\n' +
              '6. يبدأ المنظّم التصويت، ويختار كل لاعب المشتبه به.\n' +
              `7. التصويت الصحيح = ${SCORE_CORRECT_VOTE} نقطتين، والهروب دون كشف = ${SCORE_OUTSIDER_ESCAPED} نقاط.\n` +
              '8. استخدم `/outsideleaderboard` لعرض المتصدرين.'
            )
          ],
          flags: MessageFlags.Ephemeral
        });
      }
    }

    if (!interaction.isButton()) return;

    const [action, guildId, targetId] =
      interaction.customId.split(':');

    const game = games.get(guildId);

    if (!game) {
      return interaction.reply({
        content: 'هذه اللعبة لم تعد نشطة.',
        flags: MessageFlags.Ephemeral
      });
    }

    if (action === 'outside_join') {
      if (game.phase !== 'lobby') {
        return interaction.reply({
          content: 'بدأت اللعبة بالفعل.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (game.players.has(interaction.user.id)) {
        return interaction.reply({
          content: 'أنت منضم بالفعل.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (game.players.size >= MAX_PLAYERS) {
        return interaction.reply({
          content: `اكتمل الحد الأقصى وهو ${MAX_PLAYERS} لاعبًا.`,
          flags: MessageFlags.Ephemeral
        });
      }

      game.players.add(interaction.user.id);
      game.displayNames[interaction.user.id] =
        interaction.member?.displayName || interaction.user.username;

      return interaction.reply({
        content: `انضممت بنجاح! عدد اللاعبين: ${game.players.size}.`,
        flags: MessageFlags.Ephemeral
      });
    }

    if (action === 'outside_start') {
      if (interaction.user.id !== game.hostId) {
        return interaction.reply({
          content: 'فقط منظّم اللعبة يستطيع بدءها.',
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral
      });

      const error = await startGame(
        interaction.guild,
        game,
        interaction.channel
      );

      return interaction.editReply(
        error || 'بدأت اللعبة وأُرسلت الأدوار برسائل خاصة.'
      );
    }

    if (action === 'outside_cancel') {
      if (interaction.user.id !== game.hostId) {
        return interaction.reply({
          content: 'فقط منظّم اللعبة يستطيع إلغاءها.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (game.voteTimer) clearTimeout(game.voteTimer);

      games.delete(guildId);

      return interaction.update({
        content: 'تم إلغاء غرفة برا السالفة.',
        embeds: [],
        components: []
      });
    }

    if (action === 'outside_voteopen') {
      if (interaction.user.id !== game.hostId) {
        return interaction.reply({
          content: 'فقط منظّم اللعبة يستطيع بدء التصويت.',
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferUpdate();
      await startVoting(guildId, interaction.channel);
      return;
    }

    if (action === 'outside_vote') {
      if (game.phase !== 'voting') {
        return interaction.reply({
          content: 'التصويت غير مفتوح الآن.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (!game.players.has(interaction.user.id)) {
        return interaction.reply({
          content: 'أنت لست ضمن هذه الجولة.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (targetId === interaction.user.id) {
        return interaction.reply({
          content: 'لا يمكنك التصويت لنفسك.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (!game.players.has(targetId)) {
        return interaction.reply({
          content: 'هذا اللاعب ليس ضمن الجولة.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (game.votes.has(interaction.user.id)) {
        return interaction.reply({
          content: 'تم تسجيل تصويتك مسبقًا.',
          flags: MessageFlags.Ephemeral
        });
      }

      game.votes.set(interaction.user.id, targetId);

      return interaction.reply({
        content: `تم تسجيل تصويتك لـ ${mention(targetId)}.`,
        flags: MessageFlags.Ephemeral
      });
    }
  } catch (error) {
    console.error('خطأ في البوت:', error);

    if (
      interaction.isRepliable() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction.reply({
        content: 'حدث خطأ. راجع نافذة CMD لمعرفة التفاصيل.',
        flags: MessageFlags.Ephemeral
      }).catch(() => {});
    }
  }
});

client.login(TOKEN).catch(error => {
  console.error('فشل تسجيل دخول البوت. تحقق من DISCORD_TOKEN:', error.message);
  process.exit(1);
});
