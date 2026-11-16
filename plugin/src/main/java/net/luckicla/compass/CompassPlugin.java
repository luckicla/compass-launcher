package net.luckicla.compass;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.command.PluginCommand;
import org.bukkit.command.TabExecutor;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.permissions.PermissionAttachment;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * Comandos de Compass Launcher para Paper: /tpa, /tpaccept, /tpdeny, /ctp, /sethome, /home, /homes, /delhome y /compass.
 * Igual que el mod de Fabric: el plugin registra los comandos (con autocompletado y solo visibles para quien puede usarlos)
 * y avisa a Compass por la consola; Compass hace el resto, como con los comandos «!».
 */
public class CompassPlugin extends JavaPlugin implements TabExecutor, Listener {
  static final String[] CMDS = { "compass", "tpa", "tpaccept", "tpdeny", "ctp", "sethome", "home", "homes", "delhome" };
  String token = "", tpa = "all", ctp = "perm", home = "all";
  Set<String> tpNames = new HashSet<>(), homeNames = new HashSet<>();
  long stamp = -1;
  final Map<UUID, PermissionAttachment> perms = new HashMap<>();

  File f(String n) { return new File(Bukkit.getWorldContainer(), n); }
  JsonElement read(String n) { try { return JsonParser.parseString(new String(Files.readAllBytes(f(n).toPath()), StandardCharsets.UTF_8)); } catch (Throwable e) { return null; } }
  long mtime(String n) { File x = f(n); return x.exists() ? x.lastModified() + x.length() : 0; }
  Set<String> names(String n) {
    Set<String> out = new HashSet<>(); JsonElement e = read(n);
    if (e != null && e.isJsonArray()) for (JsonElement x : e.getAsJsonArray()) {
      if (x.isJsonObject() && x.getAsJsonObject().has("name")) out.add(x.getAsJsonObject().get("name").getAsString().toLowerCase(Locale.ROOT));
      else if (x.isJsonPrimitive()) out.add(x.getAsString().toLowerCase(Locale.ROOT));
    }
    return out;
  }
  boolean reload() {
    long st = mtime("compass-cmds.json") * 31 + mtime("compass-tp.json") * 17 + mtime("compass-home-perm.json");
    if (st == stamp) return false;
    stamp = st;
    JsonElement e = read("compass-cmds.json");
    JsonObject c = e != null && e.isJsonObject() ? e.getAsJsonObject() : new JsonObject();
    token = c.has("token") ? c.get("token").getAsString() : "";
    tpa = c.has("tpa") ? c.get("tpa").getAsString() : "all";
    ctp = c.has("ctp") ? c.get("ctp").getAsString() : "perm";
    home = c.has("home") ? c.get("home").getAsString() : "all";
    tpNames = names("compass-tp.json"); homeNames = names("compass-home-perm.json");
    return true;
  }
  boolean can(String mode, Set<String> list, Player p) { return "all".equals(mode) || ("perm".equals(mode) && list.contains(p.getName().toLowerCase(Locale.ROOT))); }
  void apply(Player p) {   // permisos de Bukkit según lo que diga Compass: así el juego solo enseña (y autocompleta) lo que puede usar
    PermissionAttachment a = perms.computeIfAbsent(p.getUniqueId(), k -> p.addAttachment(this));
    a.setPermission("compass.tpa", "all".equals(tpa));
    a.setPermission("compass.ctp", can(ctp, tpNames, p));
    a.setPermission("compass.home", can(home, homeNames, p));
    try { p.updateCommands(); } catch (Throwable ignored) {}
  }

  @Override public void onEnable() {
    reload();
    for (String c : CMDS) { PluginCommand pc = getCommand(c); if (pc != null) { pc.setExecutor(this); pc.setTabCompleter(this); } }
    getServer().getPluginManager().registerEvents(this, this);
    for (Player p : Bukkit.getOnlinePlayers()) apply(p);
    getServer().getScheduler().runTaskTimer(this, () -> { if (reload()) for (Player p : Bukkit.getOnlinePlayers()) apply(p); }, 40L, 40L);
    getLogger().info("[CompassCmd] comandos listos");
  }
  @EventHandler public void join(PlayerJoinEvent e) { reload(); apply(e.getPlayer()); }
  @EventHandler public void quit(PlayerQuitEvent e) { PermissionAttachment a = perms.remove(e.getPlayer().getUniqueId()); if (a != null) try { e.getPlayer().removeAttachment(a); } catch (Throwable ignored) {} }

  @Override public boolean onCommand(CommandSender s, Command cmd, String label, String[] args) {
    String line = (cmd.getName() + " " + String.join(" ", args)).trim();
    if (!(s instanceof Player)) { getLogger().info("[CompassCmd] prueba " + line); return true; }
    reload();
    getLogger().info("[CompassCmd:" + token + "] " + s.getName() + " " + line);
    return true;
  }

  List<String> players(CommandSender s, boolean self) {
    List<String> l = new ArrayList<>();
    for (Player p : Bukkit.getOnlinePlayers()) if (self || !p.getName().equalsIgnoreCase(s.getName())) l.add(p.getName());
    return l;
  }
  List<String> homes(CommandSender s) {
    List<String> l = new ArrayList<>(); JsonElement e = read("compass-homes.json"); String me = s.getName().toLowerCase(Locale.ROOT);
    if (e != null && e.isJsonObject() && e.getAsJsonObject().has(me) && e.getAsJsonObject().get(me).isJsonObject())
      for (Map.Entry<String, JsonElement> x : e.getAsJsonObject().getAsJsonObject(me).entrySet()) l.add(x.getKey());
    return l;
  }
  @Override public List<String> onTabComplete(CommandSender s, Command cmd, String label, String[] args) {
    List<String> l = new ArrayList<>();
    String n = cmd.getName().toLowerCase(Locale.ROOT), cur = args.length > 0 ? args[args.length - 1].toLowerCase(Locale.ROOT) : "";
    if (n.equals("tpa") && args.length == 1) l = players(s, false);
    else if (n.equals("ctp")) { if (args.length == 1) { l = players(s, false); l.add("~"); } else if (args.length == 2) { l = players(s, true); l.add("~"); } else if (args.length <= 4) l.add("~"); }
    else if ((n.equals("home") || n.equals("delhome") || n.equals("sethome")) && args.length == 1) l = homes(s);
    List<String> out = new ArrayList<>();
    for (String x : l) if (x.toLowerCase(Locale.ROOT).startsWith(cur)) out.add(x);
    return out;
  }
}
