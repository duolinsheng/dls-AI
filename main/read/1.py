# tsv2csv
v=open("/Users/huaxiaojun/Documents/GitHub/dls-AI/main/read/word_list.csv","r")
v2=open("/Users/huaxiaojun/Documents/GitHub/dls-AI/main/read/word_1list.csv","w")
for i in v:
    i=i.replace("\t",", ")
    v2.write(i)
v.close()
v2.close()
