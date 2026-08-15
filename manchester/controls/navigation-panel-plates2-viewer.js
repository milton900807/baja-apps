function (plate_graph, selectedPlate, selectedPoint) {
  return new Promise(async (resolve) => {
    const pt = plate_graph.plateTrack;

    let interpreter = await exec('baja/engine/interpreter.js', pt);
    let timeline_interpreter = await exec('baja/engine/timeline-interpreter.js', pt);
    let Menu = await exec('flexigraph/menu.js');

    const getPlateName = () => (selectedPlate && selectedPlate.name) ? selectedPlate.name : '--';
    const truncate = (s, n = 10) => (s && s.length > n) ? s.slice(0, n) + '...' : s || '';
    const menuTitle = truncate(getPlateName());

    function calculateXCoordinate(date, startDate, endDate) {
      if (!(date instanceof Date) || !(startDate instanceof Date) || !(endDate instanceof Date)) {
        throw new Error("All arguments must be valid Date objects.");
      }
      const spanMs = endDate - startDate;
      if (spanMs === 0) throw new Error("startDate and endDate must not be the same.");
      return (date - startDate) / (1000 * 60 * 60);
    }

    const addOneDay = (d) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; };
    const subOneDay = (d) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; };

    async function execCMD(str) {
      const r = await timeline_interpreter.executeCommand(str);
      if (r && r.type === 'rgx') {
        const d = new Date(r.datetime);
        const pr = r.raw_prompt;

        const xvalue = calculateXCoordinate(d, selectedPlate.startDate, selectedPlate.endDate);
        const icon = await getLJIcon(pr);

        selectedPlate.scatterData.points.push({
          x: xvalue, y: 0.1, type: 'milestone', name: `${pr}`, color: 'red', ...(icon ? { icon } : {})
        });

        const xStart = calculateXCoordinate(subOneDay(d), selectedPlate.startDate, selectedPlate.endDate);
        const xEnd   = calculateXCoordinate(addOneDay(d), selectedPlate.startDate, selectedPlate.endDate);

        const xstartsc = selectedPlate.grid.X(xStart);
        const xendsc   = selectedPlate.grid.X(xEnd);

        const screen_xm = pt.grid.Xwc(xstartsc);
        const screen_xp = pt.grid.Xwc(xendsc);

        const screen_y = selectedPlate.grid.Y(0);
        const screen_x = selectedPlate.grid.X(xvalue);

        const small_width  = pt.grid.worldWidth(200);
        const small_height = pt.grid.worldHeight(200 + pt.grid.yinset);
        const rect_x = pt.grid.Xwc(screen_x) - small_width / 2;
        const rect_y = pt.grid.Ywc(screen_y + pt.grid.yinset) - small_height / 2;
        await pt.zoomto(rect_x, rect_y, small_width, small_height);
      }
    }

    function buildCommonPlateMenuItems() {
      return [

      ];
    }

    if (selectedPlate && selectedPlate.getContextMenuItems) {
      const mBase = await selectedPlate.getContextMenuItems(pt);
      let m = [];

      const runCommand = createIon(async (str, panel) => {
        if (selectedPlate.type === 'timeline') {
          await execCMD(str);
          return;
        }
        str = (str || '').trim();
        if (str.startsWith('=')) {
          const wells = selectedPlate.getSelectedWellsInOrder?.() || [];
          const range = selectedPlate.getWellRange(wells);
          selectedPlate.formula[range] = str.substring(1).trim();
          await interpreter.executeCommand(`${getPlateName()}:`);
          await interpreter.executeCommand(str);
        } else {
          const wells = selectedPlate.getSelectedWellsInOrder?.() || [];
          const range = selectedPlate.getWellRange(wells);
          if (selectedPlate.formula[range]) delete selectedPlate.formula[range];
          for (let w of wells) w.setValue(str);
        }
        panel?.setText('');
        pt.setMessage('Crunching the numbers...', 3);
        setTimeout(() => { pt.setMessage('Crunching the numbers...', 3); pt.updateCalculations(); }, 100);
      });

      if (!selectedPoint) {
        let panelRef = null;
        const select_display = createIonFunction((ref) => {
          panelRef = ref;
          panelRef.setCommands?.(pt.getTablesAndTagNames?.());
        });

        selectedPlate?.set___selected_well_listener?.((well) => {
          const selected_wells = Array.isArray(well) ? well : [well];
          const wr = selectedPlate.getWellRange(selected_wells);
          if (!panelRef) return;

          if (selected_wells.length === 1) {
            if (selectedPlate.formula[wr]) {
              const tmc = selectedPlate.formula[wr];
              if (!panelRef.caretInWindow) panelRef.setText('=' + tmc);
            } else {
              const val = (selected_wells[0]?.value ?? '');
              if (!panelRef.caretInWindow) panelRef.setText(val);
            }
          } else if (selected_wells.length > 1) {
            if (selectedPlate.formula[wr]) {
              const tmc = selectedPlate.formula[wr];
              if (!panelRef.caretInWindow) panelRef.setText(tmc);
            } else {
              const values = selected_wells.map(w => w.value ?? '').join(',');
              if (!panelRef.caretInWindow) panelRef.setText(values);
            }
          } else {
            if (!panelRef.caretInWindow) panelRef.setText('');
          }
        });

        resolve({
          wid: 'menu',
          refCallback: select_display,
          data: {
            text: '',
            menus: [{ label: `${menuTitle}`, items: m }]
          }
        });
        return;
      }

      const sp = await selectedPlate.getViewerMenuForPoint(selectedPoint, pt);
      resolve({
        wid: 'menu',
        data: {
          menus: [
            { label: `${selectedPoint.name}`, items: sp }
          ]
        }
      });
      return;
    }

    if (selectedPlate && !selectedPoint) {
      let panelRef = null;
      const select_display = createIonFunction((ref) => { panelRef = ref; });

      const baseItems = [];

      resolve({
        wid: 'menu',
        refCallback: select_display,
        data: {
          text: '',
          cmd: createIon(async (str, panel) => {
            if (selectedPlate.type === 'timeline') { await execCMD(str); }
            else { panel.setText(''); }
          }),
          menus: [{ label: `${menuTitle}`, items: baseItems }]
        }
      });
      return;
    }

    if (selectedPoint) {
      const base = await selectedPlate.getContextMenuItems(pt);
      const m = Menu.removeDuplicateLabels(base);
      const sp = await selectedPlate.getViewerMenuForPoint(selectedPoint, pt);

      resolve({
        wid: 'menu',
        data: {
          cmd: createIon(async (str) => { await execCMD(str); }),
          menus: [
            { label: `${menuTitle}`, items: m },
            { label: `${selectedPoint.name}`, items: sp }
          ]
        }
      });
      return;
    }

    const MSGraph = await exec('lib/msgraph.js');

    let mm = [
    ];

    if (!MSGraph.isLoggedIn()) {
      mm = [{ label: `Sign up to unlock`, click: () => { signup(); } }];
    }

    resolve({
      wid: 'menu',
      data: { menus: [{ label: `Workbench`, items: mm }] }
    });
  });
}
