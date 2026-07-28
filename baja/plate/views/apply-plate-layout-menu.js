function (pt, fromPlate) {

    return new Promise(async (resolve, reject) => {

        let Plate = await exec('baja/plate/plate.js');
        let GenericWell = await exec('baja/plate/well.js')

        let dose_response_layout = [
            [
                {
                    "name": "A1",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "B1",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "C1",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "D1",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "E1",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "F1",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "G1",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "H1",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                }
            ],
            [
                {
                    "name": "A2",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "B2",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "C2",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "D2",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "E2",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "F2",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "G2",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "H2",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                }
            ],
            [
                {
                    "name": "A3",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "B3",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "C3",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "D3",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "E3",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "F3",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "G3",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "H3",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                }
            ],
            [
                {
                    "name": "A4",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "B4",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "C4",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "D4",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "E4",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "F4",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "G4",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "H4",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                }
            ],
            [
                {
                    "name": "A5",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "B5",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "C5",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "D5",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "E5",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "F5",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "G5",
                    "select": false,
                    "group": null,
                    "color": "lightGray",
                },
                {
                    "name": "H5",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                }
            ],
            [
                {
                    "name": "A6",
                    "select": false,
                    "group": "UTC",
                    "color": "lightBlue",
                    "compoundId": "UTC\r"
                },
                {
                    "name": "B6",
                    "select": false,
                    "group": "UTC",
                    "color": "lightBlue",
                    "compoundId": "UTC\r"
                },
                {
                    "name": "C6",
                    "select": false,
                    "group": "UTC",
                    "color": "lightBlue",
                    "compoundId": "UTC\r"
                },
                {
                    "name": "D6",
                    "select": false,
                    "group": "UTC",
                    "color": "lightBlue",
                    "compoundId": "UTC\r"
                },
                {
                    "name": "E6",
                    "select": false,
                    "group": "UTC",
                    "color": "lightBlue",
                    "compoundId": "UTC\r"
                },
                {
                    "name": "F6",
                    "select": false,
                    "group": "UTC",
                    "color": "lightBlue",
                    "compoundId": "UTC\r"
                },
                {
                    "name": "G6",
                    "select": false,
                    "group": "UTC",
                    "color": "lightBlue",
                    "compoundId": "UTC\r"
                },
                {
                    "name": "H6",
                    "select": false,
                    "group": "UTC",
                    "color": "lightBlue",
                    "compoundId": "UTC\r"
                }
            ],
            [
                {
                    "name": "A7",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "B7",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "C7",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "D7",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "E7",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "F7",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "G7",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "H7",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                }
            ],
            [
                {
                    "name": "A8",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "B8",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "C8",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "D8",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "E8",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "F8",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "G8",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "H8",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                }
            ],
            [
                {
                    "name": "A9",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "B9",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "C9",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "D9",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "E9",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "F9",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "G9",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "H9",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                }
            ],
            [
                {
                    "name": "A10",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "B10",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "C10",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "D10",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "E10",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "F10",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "G10",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "H10",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                }
            ],
            [
                {
                    "name": "A11",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "B11",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "C11",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "D11",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "E11",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "F11",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "G11",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                },
                {
                    "name": "H11",
                    "select": false,
                    "group": null,
                    "color": "lightGray",

                }
            ],
            [
                {
                    "name": "A12",
                    "concentration": 10000,
                    "select": false,
                    "group": "STD",
                    "color": "magenta",
                    "compoundId": "STD\r"
                },
                {
                    "name": "B12",
                    "concentration": 5000,
                    "select": false,
                    "group": "STD",
                    "color": "magenta",
                    "compoundId": "STD\r"
                },
                {
                    "name": "C12",
                    "concentration": 2500,
                    "select": false,
                    "group": "STD",
                    "color": "magenta",
                    "compoundId": "STD\r"
                },
                {
                    "name": "D12",
                    "concentration": 1250,
                    "select": false,
                    "group": "STD",
                    "color": "magenta",
                    "compoundId": "STD\r"
                },
                {
                    "name": "E12",
                    "select": false,
                    "group": "UTC",
                    "color": "lightBlue",
                    "compoundId": "UTC\r"
                },
                {
                    "name": "F12",
                    "select": false,
                    "group": "UTC",
                    "color": "lightBlue",
                    "compoundId": "UTC\r"
                },
                {
                    "name": "G12",
                    "select": false,
                    "group": "UTC",
                    "color": "lightBlue",
                    "compoundId": "UTC\r"
                },
                {
                    "name": "H12",
                    "select": false,
                    "group": "UTC",
                    "color": "lightBlue",
                    "compoundId": "UTC\r"
                }
            ]
        ]

        let rtsLayout = [
            [
                {
                    "name": "A1",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "B1",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "C1",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "D1",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "E1",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "F1",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "G1",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "H1",
                    "select": false,
                    "color": "lightGray",

                }
            ],
            [
                {
                    "name": "A2",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "B2",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "C2",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "D2",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "E2",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "F2",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "G2",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "H2",
                    "select": false,
                    "color": "lightGray",

                }
            ],
            [
                {
                    "name": "A3",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "B3",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "C3",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "D3",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "E3",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "F3",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "G3",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "H3",
                    "select": false,
                    "color": "lightGray",

                }
            ],
            [
                {
                    "name": "A4",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "B4",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "C4",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "D4",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "E4",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "F4",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "G4",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "H4",
                    "select": false,
                    "color": "lightGray",

                }
            ],
            [
                {
                    "name": "A5",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "B5",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "C5",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "D5",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "E5",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "F5",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "G5",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "H5",
                    "select": false,
                    "color": "lightGray",

                }
            ],
            [
                {
                    "name": "A6",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "B6",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "C6",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "D6",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "E6",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "F6",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "G6",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "H6",
                    "select": false,
                    "color": "lightGray",

                }
            ],
            [
                {
                    "name": "A7",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "B7",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "C7",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "D7",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "E7",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "F7",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "G7",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "H7",
                    "select": false,
                    "color": "lightGray",

                }
            ],
            [
                {
                    "name": "A8",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "B8",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "C8",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "D8",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "E8",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "F8",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "G8",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "H8",
                    "select": false,
                    "color": "lightGray",

                }
            ],
            [
                {
                    "name": "A9",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "B9",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "C9",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "D9",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "E9",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "F9",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "G9",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "H9",
                    "select": false,
                    "color": "lightGray",

                }
            ],
            [
                {
                    "name": "A10",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "B10",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "C10",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "D10",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "E10",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "F10",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "G10",
                    "select": false,
                    "color": "lightGray",

                },
                {
                    "name": "H10",
                    "select": false,
                    "color": "lightGray",

                }
            ],
            [
                {
                    "name": "A11",
                    "concentration": 10000,
                    "select": false,
                    "group": "STD",
                    "color": "magenta",

                },
                {
                    "name": "B11",
                    "concentration": 5000,
                    "select": false,
                    "group": "STD",
                    "color": "magenta",

                },
                {
                    "name": "C11",
                    "concentration": 2500,
                    "select": false,
                    "group": "STD",
                    "color": "magenta",

                },
                {
                    "name": "D11",
                    "concentration": 1250,
                    "select": false,
                    "group": "STD",
                    "color": "magenta",

                },
                {
                    "name": "E11",
                    "select": false,
                    "group": "UTC",
                    "color": "lightGreen",

                },
                {
                    "name": "F11",
                    "select": false,
                    "group": "UTC",
                    "color": "lightBlue",

                },
                {
                    "name": "G11",
                    "select": false,
                    "group": "UTC",
                    "color": "lightBlue",

                },
                {
                    "name": "H11",
                    "select": false,
                    "group": "UTC",
                    "color": "lightBlue",

                }
            ],
            [
                {
                    "name": "A12",
                    "concentration": 10000,
                    "select": false,
                    "group": "STD",
                    "color": "magenta",

                },
                {
                    "name": "B12",
                    "concentration": 5000,
                    "select": false,
                    "group": "STD",
                    "color": "magenta",

                },
                {
                    "name": "C12",
                    "concentration": 2500,
                    "select": false,
                    "group": "STD",
                    "color": "magenta",

                },
                {
                    "name": "D12",
                    "concentration": 1250,
                    "select": false,
                    "group": "STD",
                    "color": "magenta",

                },
                {
                    "name": "E12",
                    "select": false,
                    "group": "UTC",
                    "color": "lightBlue",

                },
                {
                    "name": "F12",
                    "select": false,
                    "group": "UTC",
                    "color": "lightBlue",

                },
                {
                    "name": "G12",
                    "select": false,
                    "group": "UTC",
                    "color": "lightBlue",

                },
                {
                    "name": "H12",
                    "select": false,
                    "group": "UTC",
                    "color": "lightBlue",

                }
            ]
        ]

        let defaultLayout = [
            [
                {
                    "name": "A1",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "B1",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "C1",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "D1",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "E1",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "F1",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "G1",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "H1",
                    "select": false,
                    "color": "lightGray"
                }
            ],
            [
                {
                    "name": "A2",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "B2",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "C2",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "D2",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "E2",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "F2",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "G2",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "H2",
                    "select": false,
                    "color": "lightGray"
                }
            ],
            [
                {
                    "name": "A3",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "B3",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "C3",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "D3",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "E3",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "F3",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "G3",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "H3",
                    "select": false,
                    "color": "lightGray"
                }
            ],
            [
                {
                    "name": "A4",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "B4",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "C4",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "D4",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "E4",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "F4",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "G4",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "H4",
                    "select": false,
                    "color": "lightGray"
                }
            ],
            [
                {
                    "name": "A5",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "B5",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "C5",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "D5",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "E5",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "F5",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "G5",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "H5",
                    "select": false,
                    "color": "lightGray"
                }
            ],
            [
                {
                    "name": "A6",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "B6",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "C6",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "D6",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "E6",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "F6",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "G6",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "H6",
                    "select": false,
                    "color": "lightGray"
                }
            ],
            [
                {
                    "name": "A7",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "B7",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "C7",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "D7",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "E7",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "F7",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "G7",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "H7",
                    "select": false,
                    "color": "lightGray"
                }
            ],
            [
                {
                    "name": "A8",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "B8",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "C8",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "D8",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "E8",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "F8",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "G8",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "H8",
                    "select": false,
                    "color": "lightGray"
                }
            ],
            [
                {
                    "name": "A9",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "B9",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "C9",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "D9",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "E9",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "F9",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "G9",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "H9",
                    "select": false,
                    "color": "lightGray"
                }
            ],
            [
                {
                    "name": "A10",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "B10",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "C10",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "D10",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "E10",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "F10",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "G10",
                    "select": false,
                    "color": "lightGray"
                },
                {
                    "name": "H10",
                    "select": false,
                    "color": "lightGray"
                }
            ],
            [
                {
                    "name": "A11",
                    "select": false,
                    "group": "POSCTRL",
                    "color": "lightGreen"
                },
                {
                    "name": "B11",
                    "select": false,
                    "group": "POSCTRL",
                    "color": "lightGreen"
                },
                {
                    "name": "C11",
                    "select": false,
                    "group": "POSCTRL",
                    "color": "lightGreen"
                },
                {
                    "name": "D11",
                    "select": false,
                    "group": "POSCTRL",
                    "color": "lightGreen"
                },
                {
                    "name": "E11",
                    "select": false,
                    "group": "NEGCTRL",
                    "color": "orange"
                },
                {
                    "name": "F11",
                    "select": false,
                    "group": "NEGCTRL",
                    "color": "orange"
                },
                {
                    "name": "G11",
                    "select": false,
                    "group": "NEGCTRL",
                    "color": "orange"
                },
                {
                    "name": "H11",
                    "select": false,
                    "group": "NEGCTRL",
                    "color": "orange"
                }
            ],
            [
                {
                    "name": "A12",
                    "select": false,
                    "group": "UTC",
                    "color": "blue"
                },
                {
                    "name": "B12",
                    "select": false,
                    "group": "UTC",
                    "color": "blue"
                },
                {
                    "name": "C12",
                    "select": false,
                    "group": "UTC",
                    "color": "blue"
                },
                {
                    "name": "D12",
                    "select": false,
                    "group": "UTC",
                    "color": "blue"
                },
                {
                    "name": "E12",
                    "select": false,
                    "group": "UTC",
                    "color": "blue"
                },
                {
                    "name": "F12",
                    "select": false,
                    "group": "UTC",
                    "color": "blue"
                },
                {
                    "name": "G12",
                    "select": false,
                    "group": "UTC",
                    "color": "blue"
                },
                {
                    "name": "H12",
                    "select": false,
                    "group": "UTC",
                    "color": "blue"
                }
            ]
        ]

        let Menu = await exec('flexigraph/menu.js');
        let menuList = []
        let editor;
        r = createIonFunction((p) => {
            editor = p;
        })

        menuList.push(

            {
                label: `bajabio Default 96w`,
                click: (scx, scy) => {

                    let ww = []
                    let rows = defaultLayout;
                    for (let r of rows) {
                        for (let w of r) {
                            for (let y of fromPlate.wells) {
                                for (let x of y) {
                                    if (x.name.toLowerCase() === w.name.toLowerCase()) {
                                        x.color = w.color;
                                        x.appendGroups(w.getGroups());
                                    }
                                }
                            }

                        }
                    }
                },
                move: () => {
                }
            });

        menuList.push(

            {
                label: `bajabio RTS 96w`,
                click: (scx, scy) => {

                    let ww = []
                    let rows = rtsLayout;
                    for (let r of rows) {
                        for (let w of r) {
                            for (let y of fromPlate.wells) {
                                for (let x of y) {
                                    if (x.name.toLowerCase() === w.name.toLowerCase()) {
                                        x.color = w.color;
                                        x.appendGroups(w.getGroups());
                                    }
                                }
                            }

                        }
                    }
                },
                move: () => {
                }
            });

        menuList.push(

            {
                label: `bajabio Dose-response 96w`,
                click: (scx, scy) => {

                    let ww = []
                    let rows = dose_response_layout;
                    for (let r of rows) {
                        for (let w of r) {
                            for (let y of fromPlate.wells) {
                                for (let x of y) {
                                    if (x.name.toLowerCase() === w.name.toLowerCase()) {
                                        x.color = w.color;
                                        x.appendGroups(w.getGroups());
                                    }
                                }
                            }
                        }
                    }
                },
                move: () => {
                }
            });

        let menu = new Menu(menuList, 0, 100)
        resolve(menu)
    })

}
