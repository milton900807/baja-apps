function () {

    return {
        'Multiplexed \u0394 Ct': (plate1, plate2) => {

               if (!plate1.wells || !plate2.wells) {
                return false;
            }
            let plate2WellsByName = new Map();
            for (let x = 0; x < plate2.wells.length; x++) {
                for (let y = 0; y < plate2.wells[x].length; y++) {
                    let well2 = plate2.wells[x][y];
                    if (well2 && well2.name) {
                        plate2WellsByName.set(well2.name, well2);
                    }
                }
            }

            for (let x = 0; x < plate1.wells.length; x++) {
                for (let y = 0; y < plate1.wells[x].length; y++) {
                    let well1 = plate1.wells[x][y];

                    if (well1 && well1.name) {
                        let well2 = plate2WellsByName.get(well1.name);
                    }
                }
            }

            return true;
        },
        'Multiplexed Ct': (plate1, plate2) => {

            if (!plate1.wells || !plate2.wells) {
                return false;
            }

            let plate2WellsByName = new Map();

            for (let x = 0; x < plate2.wells.length; x++) {
                for (let y = 0; y < plate2.wells[x].length; y++) {
                    let well2 = plate2.wells[x][y];
                    if (well2 && well2.name) {
                        plate2WellsByName.set(well2.name, well2);
                    }
                }
            }

            for (let x = 0; x < plate1.wells.length; x++) {
                for (let y = 0; y < plate1.wells[x].length; y++) {
                    let well1 = plate1.wells[x][y];

                    if (well1 && well1.name) {
                        let well2 = plate2WellsByName.get(well1.name);
                    }
                }
            }

            return true;
        },

        'Technical-replicates':
            (plate1, plate2) => {

                function buildAddressToGroupMap(plate) {
                    let addressToGroupMap = {};
                    for (let x = 0; x < plate.wells.length; x++) {
                        for (let y = 0; y < plate.wells[x].length; y++) {
                            let well = plate.wells[x][y];
                            if (well && well.name && well.group) {
                                addressToGroupMap[well.name] = well.group;
                            }
                        }
                    }
                    return addressToGroupMap;
                }
                function buildAddressToObj(plate) {
                    let addressToGroupMap = {};
                    for (let x = 0; x < plate.wells.length; x++) {
                        for (let y = 0; y < plate.wells[x].length; y++) {
                            let well = plate.wells[x][y];
                            if (well && well.name && well.obj) {
                                addressToGroupMap[well.name] = well.obj;
                            }
                        }
                    }
                    return addressToGroupMap;
                }

                let plate1Map = buildAddressToGroupMap(plate1);
                let plate2Map = buildAddressToGroupMap(plate2);

                for (let address in plate1Map) {
                    if (plate2Map.hasOwnProperty(address)) {

                        if (plate1Map[address] !== plate2Map[address]) {
                            console.log(`Group mismatch for well address ${address}: ${plate1Map[address]} vs ${plate2Map[address]}`);
                            return false;
                        }
                    }
                }
                return true;
            },
            'Biological Replicate':
            (plate1, plate2) => {

                function buildAddressToGroupMap(plate) {
                    let addressToGroupMap = {};
                    for (let x = 0; x < plate.wells.length; x++) {
                        for (let y = 0; y < plate.wells[x].length; y++) {
                            let well = plate.wells[x][y];
                            if (well && well.name && well.group) {
                                addressToGroupMap[well.name] = well.group;
                            }
                        }
                    }
                    return addressToGroupMap;
                }
                function buildAddressToObj(plate) {
                    let addressToGroupMap = {};
                    for (let x = 0; x < plate.wells.length; x++) {
                        for (let y = 0; y < plate.wells[x].length; y++) {
                            let well = plate.wells[x][y];
                            if (well && well.name && well.obj) {
                                addressToGroupMap[well.name] = well.obj;
                            }
                        }
                    }
                    return addressToGroupMap;
                }

                let plate1Map = buildAddressToGroupMap(plate1);
                let plate2Map = buildAddressToGroupMap(plate2);

                for (let address in plate1Map) {
                    if (plate2Map.hasOwnProperty(address)) {

                        if (plate1Map[address] !== plate2Map[address]) {
                            console.log(`Group mismatch for well address ${address}: ${plate1Map[address]} vs ${plate2Map[address]}`);
                            return false;
                        }
                    }
                }
                return true;
            }

    }

}
