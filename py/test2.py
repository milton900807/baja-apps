import requests
import json
from datetime import datetime
import pandas as pd
from ion import works
import plotly.express as px
import sys
from datetime import date
import numpy as np
import matplotlib.pyplot as plt  # To visualize
import pandas as pd  # To read data
from sklearn.linear_model import LinearRegression

# loc = ['AUT', 'USA', 'BRA']
# # loc = ['USA']
    
    
# ndays = [
#     10,
#     20,
#     30,
#     90
# ]
dformat = '%Y-%m-%d'
def to_integer(dt_time):
    return 10000*dt_time.year + 100*dt_time.month + dt_time.day
co = ["location", 
      "lineage", 
      "date", 
      "lineage_count", 
      "total_count", 
      "total_count_rolling",
      "lineage_count_rolling",
      "daily_prop",
      "proportion",
      "proportion_ci_lower",
      "proportion_ci_upper"]
# voc = works.param (1)
# loc = works.param (2)
# ndays = works.param(3)
ndays = 60
voc = [
        'AY.1',
        'AY.2',
        'B.1.1.7',
        'B.1.351',
        'B.1.617.2',
        'P.1',
        'P.1.1',
        'P.1.2']
loc = ['AUT', 'USA', 'BRA', 'CHE', 'RUS', 'TUR' ]


print ( sys.argv )


if not isinstance ( ndays, list ):
    ndays = [ndays]
if not isinstance ( loc, list ):
    loc = [loc]
if not isinstance ( voc, list ):
    voc = [voc]
df = pd.DataFrame ( columns=co )
for day_count in ndays:
    print ( ' Results for ', str(day_count))
    for lineage in voc:
        for location in loc:
            url = 'https://api.outbreak.info/genomics/prevalence-by-location?pangolin_lineage={lineage}&location_id={location}'
            url=url.format ( lineage = lineage, location = location )
            print ( url )

            resp = requests.get(url)
            data = resp.json() # Check the JSON Response Content documentation below
            # print ( url )
            # print ( data['results'] )
            if data['results'] is not None:
                sorted_results = sorted(data['results'], key=lambda k: datetime.strptime(k['date'], dformat), reverse=True)
                # print(json.dumps(sorted_results, indent=2))
                if len(sorted_results) > 0:
                    start = datetime.strptime(sorted_results[0]['date'], dformat)
                    day_index = 1
                    for i in sorted_results:
                        cdate =datetime.strptime(i['date'], dformat)
                        dayDiff = start-cdate
                        if dayDiff.days == day_count:
                            break

                        df = df.append ( {
                            'location' : location,
                            'lineage': lineage,
                            'date': cdate,
                            'datei': day_index,
                            'lineage_count' : float ( i['lineage_count']),
                            'total_count': float(i['total_count']),
                            'total_count_rolling' : float ( i['total_count_rolling']),
                            'lineage_count_rolling' : float ( i['lineage_count_rolling']),
                            'daily_prop':  float ( i['lineage_count'])/float(i['total_count']),
                            'proportion': i['proportion'],
                            'proportion_ci_lower': i['proportion_ci_lower'],
                            'proportion_ci_upper': i['proportion_ci_upper'],
                            'ndays' : float(day_count)
                        }, ignore_index=True )
                        day_index += 1
res={}
i=0
for location in loc:
    dfl = df[df['location'] == location]
    dfl = dfl.sort_values(by='datei')


    i+=1
    fig = px.scatter(dfl, x='date', y='daily_prop', color='lineage')
    filepath = works.tempfile ('.png')
    fig.write_image(filepath)   
    url = works.getURL ( filepath )
    res[location]={'image_url': url}

    for v in voc:
        dfv = dfl[dfl['lineage'] == v]
        plt.figure(i)

        if len(dfv)>0:
            X = dfv.loc[:,'datei'].values.reshape(-1, 1)    #
            X = X[::-1]
            # print ( X )

            Y = dfv.loc[:,"daily_prop"].values.reshape(-1, 1)   # 
            linear_regressor = LinearRegression()  # 
            linear_regressor.fit(X, Y)  # 
            Y_pred = linear_regressor.predict(X)  
            plt.scatter(X, Y, label=v)
            plt.plot(X, Y_pred, label=v)
            plt.legend(bbox_to_anchor=(.05, 1), fontsize='xx-small')

    filepath = works.tempfile ('.png')
    plt.savefig(filepath)   
    plt.data = []

    url = works.getURL ( filepath )
    res[location + '__']={'image_url': url}

works.resolve (res)
#  pass the json object to the output 
# works.resolve ( json.loads(result) )
    
    
    

