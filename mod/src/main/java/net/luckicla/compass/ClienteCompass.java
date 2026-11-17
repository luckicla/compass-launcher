package net.luckicla.compass;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.File;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.contents.TranslatableContents;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * En los perfiles de servidor de Compass, el menú principal del juego:
 *  - «Conectar al servidor» entra directo al servidor (en vez de abrir la lista de Multijugador),
 *  - y, si está activado en Compass, desaparece «Un jugador».
 * Lo que hay que hacer lo deja Compass en compass-menu.json, en la carpeta del perfil. Si algo falla, el menú se queda como siempre.
 */
public class ClienteCompass implements ClientModInitializer {
  static final Logger LOG = LoggerFactory.getLogger("compass");

  static JsonObject cfg(Minecraft mc) {
    try {
      File f = new File(mc.gameDirectory, "compass-menu.json");
      if (!f.exists()) return null;
      JsonElement e = JsonParser.parseString(new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8));
      return e.isJsonObject() ? e.getAsJsonObject() : null;
    } catch (Throwable t) { return null; }
  }
  static String key(AbstractWidget w) {
    try { if (w.getMessage().getContents() instanceof TranslatableContents tc) return tc.getKey(); } catch (Throwable ignored) {}
    return "";
  }

  @Override
  public void onInitializeClient() {
    ScreenEvents.AFTER_INIT.register((client, screen, w, h) -> {
      if (!(screen instanceof TitleScreen)) return;
      try { menu(client, screen); } catch (Throwable t) { LOG.warn("Compass: no he podido cambiar el menú", t); }
    });
  }

  static void menu(Minecraft mc, Screen screen) {
    JsonObject c = cfg(mc); if (c == null || !c.has("server")) return;
    String addr = c.get("server").getAsString(), name = c.has("name") ? c.get("name").getAsString() : addr;
    String label = c.has("label") ? c.get("label").getAsString() : "Conectar al servidor";
    boolean hideSp = c.has("hideSingleplayer") && c.get("hideSingleplayer").getAsBoolean();
    List<AbstractWidget> list = buttons(screen); if (list == null) return;
    AbstractWidget sp = null, mp = null;
    for (AbstractWidget x : list) { String k = key(x); if (k.equals("menu.singleplayer")) sp = x; else if (k.equals("menu.multiplayer")) mp = x; }
    if (mp == null) return;
    AbstractWidget slot = hideSp && sp != null ? sp : mp;
    Button go = Button.builder(Component.literal(label), b -> connect(mc, screen, addr, name)).bounds(slot.getX(), slot.getY(), slot.getWidth(), slot.getHeight()).build();
    mp.visible = false; mp.active = false;
    if (hideSp && sp != null) {
      sp.visible = false; sp.active = false;
      int row = mp.getY() - sp.getY(), below = mp.getY();
      if (row > 0) for (AbstractWidget x : new ArrayList<>(list)) if (x != mp && x != sp && x.getY() > below) x.setY(x.getY() - row);
    }
    list.add(go);
    LOG.info("[CompassTest] menu: unJugador=" + (sp == null ? "no hay" : sp.visible ? "visible" : "oculto") + " conectar=" + go.getX() + "," + go.getY());
    if (System.getenv("COMPASS_TEST") != null && !tested) {   // prueba automática: pulsar «Conectar al servidor»
      tested = true;
      Thread t = new Thread(() -> { try { Thread.sleep(4000); } catch (InterruptedException ignored) {} mc.execute(() -> connect(mc, screen, addr, name)); });
      t.setDaemon(true); t.start();
    }
  }
  static boolean tested = false;

  /** Lista de botones de la pantalla (Fabric API la llama distinto según la versión: getButtons, getWidgets…). */
  @SuppressWarnings("unchecked")
  static List<AbstractWidget> buttons(Screen screen) {
    Method best = null;
    for (Method m : Screens.class.getMethods()) {
      if (!Modifier.isStatic(m.getModifiers()) || m.getParameterCount() != 1 || !m.getParameterTypes()[0].isAssignableFrom(screen.getClass()) || !List.class.isAssignableFrom(m.getReturnType())) continue;
      String n = m.getName().toLowerCase();
      if (n.contains("button") || n.contains("widget")) { best = m; break; }
    }
    try { return best == null ? null : (List<AbstractWidget>) best.invoke(null, screen); } catch (Throwable t) { LOG.warn("Compass: sin lista de botones", t); return null; }
  }

  /** Entra al servidor. Cómo se llama a ConnectScreen cambia según la versión, así que se busca el método por sus tipos. */
  static void connect(Minecraft mc, Screen parent, String addr, String name) {
    try {
      ServerAddress sa = ServerAddress.parseString(addr);
      ServerData data = null;
      for (Constructor<?> k : ServerData.class.getConstructors()) {
        Class<?>[] t = k.getParameterTypes();
        if (t.length == 3 && t[0] == String.class && t[1] == String.class) {
          Object third = t[2] == boolean.class ? Boolean.FALSE : null;
          if (t[2].isEnum()) { Object[] v = t[2].getEnumConstants(); third = v[0]; for (Object o : v) if (o.toString().equalsIgnoreCase("OTHER")) third = o; }
          data = (ServerData) k.newInstance(name, addr, third); break;
        }
      }
      for (Method m : ConnectScreen.class.getDeclaredMethods()) {
        Class<?>[] t = m.getParameterTypes();
        if (!Modifier.isStatic(m.getModifiers()) || t.length < 4) continue;
        if (!t[0].isAssignableFrom(Screen.class) || t[1] != Minecraft.class || t[2] != ServerAddress.class || t[3] != ServerData.class) continue;
        Object[] a = new Object[t.length]; a[0] = parent; a[1] = mc; a[2] = sa; a[3] = data;
        for (int i = 4; i < t.length; i++) a[i] = t[i] == boolean.class ? Boolean.FALSE : null;
        m.setAccessible(true); m.invoke(null, a); return;
      }
      LOG.warn("Compass: no encuentro cómo conectar en esta versión");
    } catch (Throwable t) { LOG.warn("Compass: no he podido conectar", t); }
  }
}
