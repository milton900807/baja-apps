function () {
    return {
        'Normalize': (plate1, plate2, catalyst) => {
            if (!plate1.wells || !plate2.wells || plate1.wells.length !== plate2.wells.length) {
                return false;
            }
            for (let x = 0; x < plate1.wells.length; x++) {
                for (let y = 0; y < plate1.wells[x].length; y++) {
                    let well1 = plate1.wells[x][y];
                    let well2 = plate2.wells[x][y];
                    if (!well1 || !well2) {
                        return false;
                    }
                    if (well1.name !== well2.name || well1.group !== well2.group) {
                        return false;
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
