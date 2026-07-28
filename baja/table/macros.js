function () {

    return [

        {
            name: 'RNA data',
            description: 'Utils for standard  curve experiments.',
            nodes: [{
                name: 'qpcr',
                description: 'QuantStudio table (table name is qpcr and contains a target label) ',
                nodes: [

                    {
                        name: 'Extract Target',
                        description: ``,
                        function: '',
                        steps: [
                            {
                                name: 'Highlight TARGET Rows', function: `
                                                qpcr:
                                                highlight_rows value=TARGET
                                                select [0:][0:0]
                                            `},
                            {
                                name: 'Copy selected', function: `
                                                                qpcr:
                                                                copy
                                                                `},
                            {
                                name: 'New qpcr_target', function: `
                                    qpcr:
                                    deselect
                                    paste qpcr_target
                                    zoomin qpcr_target
                                                `},

                        ]
                    },

                    {
                        name: 'Extract HOUSEKEEPING',
                        description: ``,
                        function: '',
                        steps: [
                            {
                                name: 'Highlight Housekeeping Rows', function: `
                                                qpcr:
                                                highlight_rows value=HOUSEKEEPING
                                                select [0:][0:0]
                                            `},
                            {
                                name: 'Copy selected', function: `
                                                                qpcr:
                                                                copy
                                                                `},
                            {
                                name: 'New qpcr_Housekeeping', function: `
                                    qpcr:
                                    deselect
                                    paste qpcr_Housekeeping
                                    zoomin qpcr_Housekeeping
                                                `},

                        ]
                    },

                    {
                        name: 'Extract Cq & Quantity from Quant export',
                        description: `Generate standard curve from dilution series. ribogreen, platelayout with standards labeled as STD-{diluation}`,
                        function: '',
                        steps: [
                            {
                                name: 'Extract Cq&Cq', function: `
                                        qpcr:
                                        select [3:3][0:]
                                        select [4:4][0:]
                                        select [1:1][0:]
                                        select [2:2][0:]
                                        select [10:10][0:]
                                        select inverse
                                        delete column
                                        add column
                                        add column
                                        add column
                                        update [5,0] dCq
                                        update [6,0] ddCq
                                        update [7,0] Percent Control

                            `},
                            {
                                name: 'Hilight HPRT Rows', function: `
                                            highlight_rows value=HPRT
                                            select [0:][0:0]
                                        `},
                            {
                                name: 'New STD table', function: `
                                                    paste STD
                                                    zoomin STD
                                                    STD:
                                                    select [0:][0:0]
                                                    tag Column_Header
                                                    deselect
                                                    select [last:last][1:]
                                            `},
                            {
                                name: 'Harmonize concentrations', function: `
                                                        zoomin STD
                                                        STD:
                                                        select [last:last][1:]
                                                        sanitizetodigits
                                                `},
                            {
                                name: 'Aggregate on concentrations (last column)', function: `
                                                                                STD:
                                                                                deselect
                                                                                aggregate [1:][1:] on 2 into standard_curve
                                                                                deselect
                                                                                zoomin standard_curve
                                                                    `},

                            {
                                name: 'Plot regression', function: `
                                                                                                    standard_curve:
                                                                                                    linear_regression ribogreen_standard_curve
                                                                                                    zoomin ribogreen_standard_curve

                                                                                        `}

                        ]
                    },
                    {
                        name: 'Ribogreen standard curve',
                        description: `Generate standard curve from dilution series. ribogreen, platelayout with standards labeled as STD-{diluation}`,
                        function: '',
                        steps: [
                            {
                                name: 'Join Samples', function: `
                                    platelayout:
                                    convert to column
                                    ribogreen:
                                    join platelayout[0].address = ribogreen[0]
                                    zoomin ribogreen
                            `},
                            {
                                name: 'Find Standards', function: `
                                    ribogreen:
                                    zoomin ribogreen
                                    update 2,0 Samples
                                    select [0:][0:0]
                                    tag Column_Header
                                    highlight_rows value=STD
                                    zoomin ribogreen
                                    copy canvas
                                `},
                            {
                                name: 'New STD table', function: `
                                            paste STD
                                            zoomin STD
                                            STD:
                                            select [0:][0:0]
                                            tag Column_Header
                                            deselect
                                            select [last:last][1:]
                                    `},
                            {
                                name: 'Harmonize concentrations', function: `
                                                zoomin STD
                                                STD:
                                                select [last:last][1:]
                                                sanitizetodigits
                                        `},
                            {
                                name: 'Aggregate on concentrations (last column)', function: `
                                                                        STD:
                                                                        deselect
                                                                        aggregate [1:][1:] on 2 into standard_curve
                                                                        deselect
                                                                        zoomin standard_curve
                                                            `},

                            {
                                name: 'Plot regression', function: `
                                                                                            standard_curve:
                                                                                            linear_regression ribogreen_standard_curve
                                                                                            zoomin ribogreen_standard_curve

                                                                                `}

                        ]
                    },
                    {
                        name: 'Percent Control with ribogreen normalization',
                        description: `Once you have the standard curve this will calculate the percent control`,
                        steps: [
                            {
                                name: 'Join Samples', function: `
                                    platelayout:
                                    convert to column
                                    ribogreen:
                                    join platelayout[0].address = ribogreen[0]
                                    zoomin ribogreen
                            `},
                            {
                                name: 'Find Standards', function: `
                                    ribogreen:
                                    zoomin ribogreen
                                    update 2,0 Samples
                                    select [0:][0:0]
                                    tag Column_Header
                                    highlight_rows value=STD
                                    zoomin ribogreen
                                    copy canvas
                                `},
                            {
                                name: 'New STD table', function: `
                                            paste STD
                                            zoomin STD
                                            STD:
                                            select [0:][0:0]
                                            tag Column_Header
                                            deselect
                                            select [last:last][1:]
                                    `},
                            {
                                name: 'Harmonize concentrations', function: `
                                                zoomin STD
                                                STD:
                                                select [last:last][1:]
                                                sanitizetodigits
                                        `},
                            {
                                name: 'Aggregate on concentrations (last column)', function: `
                                                        STD:
                                                        deselect
                                                        aggregate [1:][1:] on 2 into standard_curve
                                                        deselect
                                            `}

                        ]
                    },
                    {
                        name: 'ddCq',
                        description: `Calculate ddCq & percent control using housekeeping gene; requires a target table and a housekeeping table.`,
                        steps: [
                            {
                                name: 'dCq', function: `
                                    target:
                                    add column
                                    update [last,0] dCq
                                    applyHeaders
                                    select [last:last][1:]
                                    insert values target[Cq]-housekeeping[Cq]
                            `},
                            {
                                name: 'ddCq', function: `

                                    target:
                                    deselect
                                    add column
                                    update [last,0] dCq_Expression
                                    applyHeaders

                                    select [last:last][1:]
                                    insert values 2^-(target[dCq])
                                    deselectAll
                                    select dCq_Expression where Sample = UTC
                                    average into dCq_Expression_mean
                                    deselectAll

                                `},
                            {
                                name: 'Percent Control', function: `
                                        target:
                                        add column
                                        update [last,0] percent_control
                                        applyHeaders
                                        select [last:last][1:]
                                        insert values 100*(target[dCq_Expression]/dCq_Expression_mean)

                               `},
                            {
                                name: 'Generate aggregate table', function: `
                                    deselectAll
                                    select Sample
                                    select percent_control
                                    aggregate on Sample into standard_curve
                                    deselect
                                    zoomin standard_curve

                           `}

                        ]
                    }

                ]
            }]
        },
        {
            name: 'Utilities',
            description: 'Budgets',
            nodes: [
                {
                    name: 'New screening template... ',
                    description: `Create a template for a screening campaign`,
                    steps: [
                        {
                            name: 'Create ', function: `
                            load('/templates/screening/simple-budget.bjb')
                            `
                        }
                        ,
                        {
                            name: 'Select Housekeeping', function: `

                            deselectAll
                            select top row
                            select row where 4 = prompt(Enter housekeeping reporter dye...)
                            copy
                            paste housekeeping
                            deselect
                            zoomin housekeeping
                            deselectAll

                            `

                        }
                        ,
                        {
                            name: 'Select Target DYE', function: `
                            deselectAll
                            select top row
                            select row where 4 = prompt(select where dye is...)
                            copy
                            paste target
                            deselectAll
                            zoomin target

                        `
                        }

                    ]
                },
                {
                    name: 'Select rows ',
                    description: `...where column values are... `,
                    steps: [
                        {
                            name: 'Select rows by column value', function: `
                            prompt("Table name"):
                            select [0:][0:0]
                            select row where 5 = prompt("select row where column 5 is...:)
                            `
                        },
                    ]
                },

                {
                    name: 'Select columns ',
                    description: ` ...where top row value equals... `,
                    steps: [

                        {
                            name: 'Select column by row value (prompt)', function: `
                            select column where 0 = prompt()
                            `
                        },
                    ]
                }

            ]
        },
        {
            name: 'Table',
            description: 'General table operations....',
            nodes: [
                {
                    name: 'Extract... ',
                    description: `Extract duplexed Target & housekeeping genes from Quant studio file... `,
                    steps: [
                        {
                            name: 'Trim table', function: `
                            prompt(Select table):
                            deselect

                            select row where 0 = Well
                            trim up
                            deselect
                            select column where 0 = Target
                            select column where 0 = Dye
                            select column where 0 = Quantity
                            select column where 0 = Sample
                            select column where 0 = Cq
                            select column where 0 = Well
                            select inverse
                            delete
                            `
                        }
                        ,
                        {
                            name: 'Select Housekeeping', function: `

                            deselectAll
                            select top row
                            select row where 4 = prompt(Enter housekeeping reporter dye...)
                            copy
                            paste housekeeping
                            deselect
                            zoomin housekeeping
                            deselectAll

                            `

                        }
                        ,
                        {
                            name: 'Select Target DYE', function: `
                            deselectAll
                            select top row
                            select row where 4 = prompt(select where dye is...)
                            copy
                            paste target
                            deselectAll
                            zoomin target

                        `
                        }

                    ]
                },
                {
                    name: 'Select rows ',
                    description: `...where column values are... `,
                    steps: [
                        {
                            name: 'Select rows by column value', function: `
                            prompt("Table name"):
                            select [0:][0:0]
                            select row where 5 = prompt("select row where column 5 is...:)
                            `
                        },
                    ]
                },

                {
                    name: 'Select columns ',
                    description: ` ...where top row value equals... `,
                    steps: [

                        {
                            name: 'Select column by row value (prompt)', function: `
                            select column where 0 = prompt()
                            `
                        },
                    ]
                }

            ]
        },
    ]

}
