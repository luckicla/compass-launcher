package net.luckicla.compass;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.suggestion.SuggestionProvider;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.SharedSuggestionProvider;
import net.minecraft.server.level.ServerPlayer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Comandos de Compass Launcher con «/» y autocompletado: /tpa, /tpaccept, /tpdeny, /ctp, /sethome, /home, /homes, /delhome y /compass.
 * El mod solo registra los comandos (para que el juego los conozca y los autocomplete) y avisa a Compass por la consola;
 * los permisos, las casas y los teletransportes los gestiona Compass, igual que con los comandos «!».
 * Lo que puede usar cada jugador sale de los archivos que Compass deja en la carpeta del servidor.
 */
public class ComandosCompass implements ModInitializer {
  static final Logger LOG = LoggerFactory.getLogger("compass");

  // ---------- ajustes que escribe Compass ----------
  static String token = "", tpa = "all", ctp = "perm", home = "all";
  static Set<String> tpNames = new HashSet<>(), homeNames = new HashSet<>();
  static long stamp = -1;
  static int ticks = 0;

  static JsonElement read(String f) {
    try { return JsonParser.parseString(new String(Files.readAllBytes(new File(f).toPath()), StandardCharsets.UTF_8)); } catch (Throwable e) { return null; }
  }
  static long mtime(String f) { File x = new File(f); return x.exists() ? x.lastModified() + x.length() : 0; }
  static Set<String> names(String f) {
    Set<String> out = new HashSet<>();
    JsonElement e = read(f);
    if (e != null && e.isJsonArray()) for (JsonElement x : e.getAsJsonArray()) {
      if (x.isJsonObject() && x.getAsJsonObject().has("name")) out.add(x.getAsJsonObject().get("name").getAsString().toLowerCase(Locale.ROOT));
      else if (x.isJsonPrimitive()) out.add(x.getAsString().toLowerCase(Locale.ROOT));
    }
    return out;
  }
  /** Relee los ajustes si han cambiado. Devuelve true si algo cambió. */
  static synchronized boolean reload() {
    long st = mtime("compass-cmds.json") * 31 + mtime("compass-tp.json") * 17 + mtime("compass-home-perm.json");
    if (st == stamp) return false;
    stamp = st;
    JsonElement e = read("compass-cmds.json");
    JsonObject c = e != null && e.isJsonObject() ? e.getAsJsonObject() : new JsonObject();
    token = c.has("token") ? c.get("token").getAsString() : "";
    tpa = c.has("tpa") ? c.get("tpa").getAsString() : "all";
    ctp = c.has("ctp") ? c.get("ctp").getAsString() : c.has("tp") ? c.get("tp").getAsString() : "perm";
    home = c.has("home") ? c.get("home").getAsString() : "all";
    tpNames = names("compass-tp.json");
    homeNames = names("compass-home-perm.json");
    return true;
  }

  static String who(CommandSourceStack s) { return s.getTextName(); }
  static boolean isPlayer(CommandSourceStack s) { return s.getEntity() instanceof ServerPlayer; }
  static boolean canTpa(CommandSourceStack s) { if (!isPlayer(s)) return true; reload(); return "all".equals(tpa); }
  static boolean canCtp(CommandSourceStack s) {
    if (!isPlayer(s)) return true;   // la consola los ve todos (para probar)
    reload();
    return "all".equals(ctp) || ("perm".equals(ctp) && tpNames.contains(who(s).toLowerCase(Locale.ROOT)));
  }
  static boolean canHome(CommandSourceStack s) {
    if (!isPlayer(s)) return true;
    reload();
    return "all".equals(home) || ("perm".equals(home) && homeNames.contains(who(s).toLowerCase(Locale.ROOT)));
  }

  // ---------- avisar a Compass ----------
  static int send(CommandContext<CommandSourceStack> ctx, String line) {
    CommandSourceStack s = ctx.getSource();
    if (!isPlayer(s)) { LOG.info("[CompassCmd] prueba " + line); return 1; }
    reload();
    LOG.info("[CompassCmd:" + token + "] " + who(s) + " " + line);
    return 1;
  }

  // ---------- autocompletado ----------
  static List<String> others(CommandSourceStack src) {
    List<String> l = new ArrayList<>();
    for (String n : src.getOnlinePlayerNames()) if (!n.equalsIgnoreCase(who(src))) l.add(n);
    return l;
  }
  static final SuggestionProvider<CommandSourceStack> PLAYERS = (ctx, b) -> SharedSuggestionProvider.suggest(others(ctx.getSource()), b);
  // /ctp: sugiere nombres en cada palabra (Nombre, Nombre Otro) y «~ ~ ~» para coordenadas
  static final SuggestionProvider<CommandSourceStack> CTP = (ctx, b) -> {
    String rem = b.getRemaining();
    int words = rem.isEmpty() ? 0 : rem.split(" ", -1).length - 1;
    var b2 = b.createOffset(b.getStart() + rem.lastIndexOf(' ') + 1);
    List<String> l = new ArrayList<>();
    if (words <= 1) { l.addAll(words == 0 ? others(ctx.getSource()) : ctx.getSource().getOnlinePlayerNames()); l.add("~"); }
    else l.add("~");
    return SharedSuggestionProvider.suggest(l, b2);
  };
  static final SuggestionProvider<CommandSourceStack> HOMES = (ctx, b) -> {
    List<String> l = new ArrayList<>();
    JsonElement e = read("compass-homes.json");
    String me = who(ctx.getSource()).toLowerCase(Locale.ROOT);
    if (e != null && e.isJsonObject() && e.getAsJsonObject().has(me) && e.getAsJsonObject().get(me).isJsonObject())
      for (Map.Entry<String, JsonElement> x : e.getAsJsonObject().getAsJsonObject(me).entrySet()) l.add(x.getKey());
    return SharedSuggestionProvider.suggest(l, b);
  };

  static void register(CommandDispatcher<CommandSourceStack> d) {
    Predicate<CommandSourceStack> TPA = ComandosCompass::canTpa, CTP_OK = ComandosCompass::canCtp, H = ComandosCompass::canHome;
    d.register(Commands.literal("compass").executes(c -> send(c, "compass")));
    d.register(Commands.literal("tpa").requires(TPA)
      .then(Commands.argument("jugador", StringArgumentType.word()).suggests(PLAYERS)
        .executes(c -> send(c, "tpa " + StringArgumentType.getString(c, "jugador")))));
    d.register(Commands.literal("tpaccept").requires(TPA).executes(c -> send(c, "tpaccept")));
    d.register(Commands.literal("tpdeny").requires(TPA).executes(c -> send(c, "tpdeny")));
    d.register(Commands.literal("ctp").requires(CTP_OK)
      .then(Commands.argument("destino", StringArgumentType.greedyString()).suggests(CTP)
        .executes(c -> send(c, "ctp " + StringArgumentType.getString(c, "destino")))));
    d.register(Commands.literal("sethome").requires(H).executes(c -> send(c, "sethome"))
      .then(Commands.argument("nombre", StringArgumentType.word()).suggests(HOMES).executes(c -> send(c, "sethome " + StringArgumentType.getString(c, "nombre")))));
    d.register(Commands.literal("home").requires(H).executes(c -> send(c, "home"))
      .then(Commands.argument("nombre", StringArgumentType.word()).suggests(HOMES).executes(c -> send(c, "home " + StringArgumentType.getString(c, "nombre")))));
    d.register(Commands.literal("homes").requires(H).executes(c -> send(c, "homes")));
    d.register(Commands.literal("delhome").requires(H)
      .then(Commands.argument("nombre", StringArgumentType.word()).suggests(HOMES).executes(c -> send(c, "delhome " + StringArgumentType.getString(c, "nombre")))));
  }

  @Override
  public void onInitialize() {
    CommandRegistrationCallback.EVENT.register((d, ctx, env) -> {
      try { register(d); LOG.info("[CompassCmd] comandos listos"); } catch (Throwable e) { LOG.error("Compass: no se pudieron registrar los comandos", e); }
    });
    // si cambian los permisos con la partida en marcha, se vuelve a mandar la lista de comandos a cada jugador (sin reconectar)
    ServerTickEvents.END_SERVER_TICK.register(server -> {
      if (++ticks % 40 != 0) return;
      try {
        if (reload()) for (ServerPlayer p : server.getPlayerList().getPlayers()) server.getCommands().sendCommands(p);
      } catch (Throwable e) { /* nunca tirar el servidor por esto */ }
    });
  }
}
