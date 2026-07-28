function () {

    let test = `name "exons",
      data ftable {
                {
          data imp {
            key "exon"
                    },
          location int {
            from 0,
            to 322,
            strand plus,
            id gi 1519246222
                    },
          qual {
                        {
              qual "inference",
              val "alignment:Splign:2.1.0"
                        }
                    }
                },
                {
          data imp {
            key "exon"
                    },
          location int {
            from 323,
            to 469,
            strand plus,
            id gi 1519246222
                    },
          qual {
                        {
              qual "inference",
              val "alignment:Splign:2.1.0"
                        }
                    }
                },
                {
          data imp {
            key "exon"
                    },
          location int {
            from 470,
            to 595,
            strand plus,
            id gi 1519246222
                    },
          qual {
                        {
              qual "inference",
              val "alignment:Splign:2.1.0"
                        }
                    }
                },
                {
          data imp {
            key "exon"
                    },
          location int {
            from 596,
            to 1202,
            strand plus,
            id gi 1519246222
                    },
          qual {
                        {
              qual "inference",
              val "alignment:Splign:2.1.0"
                        }
                    }
                }
            }
        },
        {
      name "polyA sites",
      data ftable {
                {
          data imp {
            key "polyA_site"
                    },
          location pnt {
            point 1202,
            strand plus,
            id gi 1519246222
                    }
                },
                {
          data imp {
            key "regulatory"
                    },
          comment "hexamer: AATAAA",
          location int {
            from 1180,
            to 1185,
            strand plus,
            id gi 1519246222
                    },
          qual {
                        {
              qual "regulatory_class",
              val "polyA_signal_sequence"
                        }
                    }
                },
                {
          data imp {
            key "polyA_site"
                    },
          comment "major polyA site",
          location pnt {
            point 924,
            strand plus,
            id gi 1519246222
                    }
                },
                {
          data imp {
            key "regulatory"
                    },
          comment "hexamer: AATAAA",
          location int {
            from 902,
            to 907,
            strand plus,
            id gi 1519246222
                    },
          qual {
                        {
              qual "regulatory_class",
              val "polyA_signal_sequence"
                        }
                    }
                }
            }
        }
    }`

    const splitLines = test.split(/\r?\n/);

    let b = '';
    let index = 0;
    for (let line of splitLines) {
        if (line.indexOf('name "exons"') >= 0) {
            let scope = 1
            for (let i = index; i < splitLines.length; i++) {
                if (splitLines[i].endsWith('{')) {
                    scope++
                } else if (splitLines[i].endsWith('},') || splitLines[i].endsWith('}')) {
                    scope--;
                }

                b += splitLines[i]

                if (scope <= 0) {
                    index = i;
                    break;
                }
            }
        }
        index++;
    }
    showWidget ( {
        wid:'json',
        data:b
    })

}
